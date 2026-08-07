"""Business logic for user sessions and login audit events (HRMS host adapter).

Delegates the shared must-match module (app/services/session_core.py) and
keeps the HRMS-specific session domain: login_method vocabulary
(oidc/break_glass), device-label parsing, JWT claim names and login flow
(complete_login / record_failed_login).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import HRMSException, NotFoundError
from app.models.user_login_event import UserLoginEvent
from app.models.user_session import UserSession
from app.repositories.login_event_repository import LoginEventRepository
from app.repositories.logout_jti_repository import LogoutJtiRepository
from app.repositories.session_repository import SessionRepository
from app.services import session_core
from app.services.session_core import JwtConfig, SessionCoreConfig, SessionCoreError
from app.utils.user_agent import device_label_from_ua

# --- string constants (validation / storage; not DB enums) ---

LOGIN_METHODS = frozenset(
    {
        "oidc",
        "break_glass",
    }
)
EVENT_TYPES = frozenset({"login_success", "login_failure", "logout", "session_revoke"})
REVOKE_REASONS = frozenset(
    {"logout", "user_revoke", "admin", "expired", "backchannel_logout"}
)

session_repo = SessionRepository()
login_event_repo = LoginEventRepository()
logout_jti_repo = LogoutJtiRepository()


class SessionInactiveError(HRMSException):
    """Session missing, revoked, or past expires_at."""

    def __init__(self, message: str = "Сессия недействительна", error_code: str = "session_inactive"):
        super().__init__(message, error_code, status_code=401)


class SessionNotFoundError(NotFoundError):
    def __init__(self, message: str = "Сессия не найдена"):
        super().__init__(message, error_code="session_not_found")


def _core_config() -> SessionCoreConfig:
    return SessionCoreConfig(
        session_repo=session_repo,
        login_event_repo=login_event_repo,
        logout_jti_repo=logout_jti_repo,
        device_label_fn=device_label_from_ua,
        login_methods=LOGIN_METHODS,
        revoke_reasons=REVOKE_REASONS,
        event_types=EVENT_TYPES,
        last_seen_throttle_seconds=settings.SESSION_LAST_SEEN_THROTTLE_SECONDS,
        min_ttl_minutes=0,
    )


def _jwt_config() -> JwtConfig:
    return JwtConfig(
        secret_key=settings.JWT_SECRET_KEY or settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
        default_ttl_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )


def _translate_input_error(exc: SessionCoreError) -> HRMSException:
    """Map invalid-input SessionCoreError to the legacy HRMS 400 contract."""
    return HRMSException(exc.message, exc.code, status_code=400)


async def issue_session(
    db: AsyncSession,
    *,
    user_id: int,
    ip: str | None,
    user_agent: str | None,
    login_method: str,
    ttl_minutes: int,
    oidc_sid: str | None = None,
) -> UserSession:
    """Insert session; expires_at = now + ttl; device_label from UA."""
    try:
        return await session_core.issue_session(
            _core_config(),
            db,
            user_id=user_id,
            login_method=login_method,
            ttl_minutes=ttl_minutes,
            ip=ip,
            user_agent=user_agent,
            oidc_sid=oidc_sid,
        )
    except SessionCoreError as exc:
        raise _translate_input_error(exc) from exc


async def assert_session_active(db: AsyncSession, session_id: UUID) -> UserSession:
    """Raise domain error if missing/revoked/expired. Throttled last_seen update."""
    try:
        return await session_core.assert_session_active(_core_config(), db, session_id)
    except SessionCoreError as exc:
        raise SessionInactiveError(exc.message, exc.code) from exc


async def revoke_session(
    db: AsyncSession,
    *,
    user_id: int,
    session_id: UUID,
    reason: str,
) -> None:
    """Revoke a session owned by user_id. Raises if not found / not owned."""
    if reason not in REVOKE_REASONS:
        raise HRMSException(
            f"Неизвестная причина отзыва: {reason}",
            "invalid_revoke_reason",
            status_code=400,
        )
    session = await session_repo.get_by_id(db, session_id)
    if session is None or session.user_id != user_id:
        raise SessionNotFoundError()
    if session.revoked_at is None:
        await session_repo.revoke(db, session_id, reason)


async def revoke_others(
    db: AsyncSession,
    *,
    user_id: int,
    current_session_id: UUID | None,
    reason: str,
) -> int:
    """Revoke all sessions for user except current. Returns revoked count."""
    if reason not in REVOKE_REASONS:
        raise HRMSException(
            f"Неизвестная причина отзыва: {reason}",
            "invalid_revoke_reason",
            status_code=400,
        )
    return await session_repo.revoke_all_for_user(
        db,
        user_id,
        reason,
        except_id=current_session_id,
    )


async def revoke_all(db: AsyncSession, *, user_id: int, reason: str) -> int:
    """Revoke all sessions for user including current. Returns revoked count."""
    if reason not in REVOKE_REASONS:
        raise HRMSException(
            f"Неизвестная причина отзыва: {reason}",
            "invalid_revoke_reason",
            status_code=400,
        )
    return await session_repo.revoke_all_for_user(db, user_id, reason, except_id=None)


async def revoke_by_oidc_sid(
    db: AsyncSession,
    *,
    user_id: int,
    oidc_sid: str,
    reason: str,
) -> list[UUID]:
    """Revoke sessions of user tied to IdP sid (back-channel SLO). Returns ids."""
    try:
        return await session_core.revoke_by_oidc_sid(
            _core_config(),
            db,
            user_id=user_id,
            oidc_sid=oidc_sid,
            reason=reason,
        )
    except SessionCoreError as exc:
        raise _translate_input_error(exc) from exc


async def is_logout_jti_used(db: AsyncSession, jti: str) -> bool:
    return await session_core.is_logout_jti_used(_core_config(), db, jti)


async def mark_logout_jti_used(
    db: AsyncSession, jti: str, *, expires_at: datetime
) -> None:
    await session_core.mark_logout_jti_used(_core_config(), db, jti, expires_at=expires_at)


async def cleanup_logout_jti(db: AsyncSession) -> int:
    """Opportunistic purge потреблённых jti с истёкшим exp."""
    return await session_core.cleanup_logout_jti(_core_config(), db)


async def list_sessions(db: AsyncSession, *, user_id: int) -> list[UserSession]:
    return await session_repo.list_active_for_user(db, user_id)


async def record_login_event(
    db: AsyncSession,
    *,
    event_type: str,
    success: bool,
    user_id: int | None = None,
    username_attempted: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    session_id: UUID | None = None,
    details: dict | None = None,
) -> UserLoginEvent:
    try:
        return await session_core.record_login(
            _core_config(),
            db,
            event_type=event_type,
            success=success,
            user_id=user_id,
            username_attempted=username_attempted,
            ip_address=ip_address,
            user_agent=user_agent,
            session_id=session_id,
            details=details,
        )
    except SessionCoreError as exc:
        raise _translate_input_error(exc) from exc


async def list_login_events(
    db: AsyncSession,
    *,
    user_id: int,
) -> list[UserLoginEvent]:
    """Login history window (retention days) for the user, newest first."""
    since = datetime.now(timezone.utc) - timedelta(days=settings.LOGIN_EVENTS_RETENTION_DAYS)
    return await login_event_repo.list_for_user(db, user_id, since=since)


async def complete_login(
    db: AsyncSession,
    *,
    user,
    login_method: str,
    ip: str | None = None,
    user_agent: str | None = None,
    oidc_sid: str | None = None,
) -> tuple[str, UserSession]:
    """
    Issue session + JWT with sid + success login_event.

    Callers pass ip/ua strings (route layer) so this stays free of Starlette.
    Returns (access_token, session).
    """
    session = await issue_session(
        db,
        user_id=user.id,
        ip=ip,
        user_agent=user_agent,
        login_method=login_method,
        ttl_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        oidc_sid=oidc_sid,
    )
    full_name = user.full_name or user.username
    token = session_core.create_access_token(
        _jwt_config(),
        subject=user.username,
        claims={"full_name": full_name, "hrms_access_level": user.role},
        session_id=session.id,
    )
    await record_login_event(
        db,
        event_type="login_success",
        success=True,
        user_id=user.id,
        username_attempted=user.username,
        ip_address=ip,
        user_agent=user_agent,
        session_id=session.id,
        details={"method": login_method},
    )
    return token, session


async def record_failed_login(
    db: AsyncSession,
    *,
    username_attempted: str | None,
    reason: str,
    method: str,
    ip: str | None = None,
    user_agent: str | None = None,
    user_id: int | None = None,
) -> UserLoginEvent:
    """Append login_failure audit row (user_id optional when username unknown)."""
    return await record_login_event(
        db,
        event_type="login_failure",
        success=False,
        user_id=user_id,
        username_attempted=username_attempted,
        ip_address=ip,
        user_agent=user_agent,
        details={"reason": reason, "method": method},
    )
