"""Business logic for user sessions and login audit events (HRMS host adapter).

Delegates the shared must-match module (app/services/session_core.py) and
keeps the HRMS-specific session domain: login_method vocabulary
(oidc/break_glass), device-label parsing, JWT claim names and login flow
(complete_login / record_failed_login).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import HRMSException, NotFoundError
from app.models.user import User
from app.models.user_login_event import UserLoginEvent
from app.models.user_session import UserSession
from app.repositories.login_event_repository import LoginEventRepository
from app.repositories.logout_jti_repository import LogoutJtiRepository
from app.repositories.session_repository import SessionRepository
from app.schemas.session import (
    LoginEventListOut,
    LoginEventOut,
    MAX_LOGIN_EVENTS_SHOWN,
    MAX_SESSIONS_SHOWN,
    SessionListOut,
    SessionOut,
)
from app.services import session_core
from app.services.session_core import JwtConfig, SessionCoreConfig, SessionCoreError, TokenError
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


def jwt_config() -> JwtConfig:
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
        jwt_config(),
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


async def resolve_user_id(
    db: AsyncSession,
    *,
    username: str,
    is_break_glass: bool = False,
) -> int:
    """Resolve active User.id from username. Break-glass (no users row) → 400."""
    if is_break_glass:
        raise HRMSException(
            "Операция недоступна для учетной записи аварийного доступа",
            error_code="break_glass_not_allowed",
            status_code=400,
        )
    result = await db.execute(
        select(User).where(User.username == username, User.is_deleted == False)
    )
    user = result.scalars().first()
    if not user:
        raise NotFoundError("Пользователь не найден")
    return user.id


async def list_my_sessions(
    db: AsyncSession,
    *,
    username: str,
    is_break_glass: bool = False,
    current_session_id: UUID | None = None,
) -> SessionListOut:
    """Активные сессии пользователя: последние MAX_SESSIONS_SHOWN + total."""
    user_id = await resolve_user_id(db, username=username, is_break_glass=is_break_glass)
    sessions = await list_sessions(db, user_id=user_id)
    out = [
        SessionOut(
            id=s.id,
            device_label=s.device_label,
            ip_address=s.ip_address,
            user_agent=s.user_agent,
            login_method=s.login_method,
            created_at=s.created_at,
            last_seen_at=s.last_seen_at,
            is_current=bool(current_session_id and s.id == current_session_id),
        )
        for s in sessions
    ]
    return SessionListOut(sessions=out[:MAX_SESSIONS_SHOWN], total=len(out))


async def revoke_other_sessions(
    db: AsyncSession,
    *,
    username: str,
    is_break_glass: bool = False,
    current_session_id: UUID | None = None,
) -> None:
    """Отозвать все остальные сессии (кроме текущей). Каноничный путь."""
    user_id = await resolve_user_id(db, username=username, is_break_glass=is_break_glass)
    await revoke_others(
        db,
        user_id=user_id,
        current_session_id=current_session_id,
        reason="user_revoke",
    )
    await record_login_event(
        db,
        event_type="session_revoke",
        success=True,
        user_id=user_id,
        username_attempted=username,
        session_id=current_session_id,
        details={"reason": "user_revoke", "scope": "others"},
    )


async def revoke_my_session(
    db: AsyncSession,
    *,
    username: str,
    session_id: UUID,
    is_break_glass: bool = False,
) -> None:
    """Отозвать одну сессию (свою). SessionNotFoundError → 404 (глобальный хендлер)."""
    user_id = await resolve_user_id(db, username=username, is_break_glass=is_break_glass)
    await revoke_session(
        db,
        user_id=user_id,
        session_id=session_id,
        reason="user_revoke",
    )
    await record_login_event(
        db,
        event_type="session_revoke",
        success=True,
        user_id=user_id,
        username_attempted=username,
        session_id=session_id,
        details={"reason": "user_revoke", "scope": "one"},
    )


async def list_my_login_events(
    db: AsyncSession,
    *,
    username: str,
    is_break_glass: bool = False,
) -> LoginEventListOut:
    """История входов пользователя: последние MAX_LOGIN_EVENTS_SHOWN + total."""
    user_id = await resolve_user_id(db, username=username, is_break_glass=is_break_glass)
    events = await list_login_events(db, user_id=user_id)
    out: list[LoginEventOut] = []
    for e in events:
        details = e.details if isinstance(e.details, dict) else {}
        out.append(
            LoginEventOut(
                id=e.id,
                event_type=e.event_type,
                success=e.success,
                ip_address=e.ip_address,
                device_label=device_label_from_ua(e.user_agent),
                login_method=details.get("method") if details else None,
                created_at=e.created_at,
                failure_reason=details.get("reason") if details else None,
            )
        )
    return LoginEventListOut(events=out[:MAX_LOGIN_EVENTS_SHOWN], total=len(out))


async def logout(db: AsyncSession, token: str | None) -> None:
    """Отозвать текущую сессию по JWT sid (Bearer токен передаёт роутер).

    Idempotent 204: already-revoked / missing sid / break-glass — no-op.
    Missing or invalid token → 401 (HRMSException).
    Magic ``admin`` under DEV_BYPASS_AUTH → no-op.
    """
    if not token:
        raise HRMSException(
            "Missing authentication token",
            error_code="missing_token",
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Magic Bearer "admin" (dev-only) — nothing to revoke
    if token == "admin":
        if not settings.DEV_BYPASS_AUTH:
            raise HRMSException(
                "Invalid or expired token",
                error_code="invalid_token",
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
        return

    try:
        payload = session_core.decode_access_token(jwt_config(), token)
    except TokenError:
        raise HRMSException(
            "Invalid or expired token",
            error_code="invalid_token",
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = payload.get("username") or payload.get("sub")
    if not username:
        raise HRMSException(
            "Invalid token payload",
            error_code="invalid_token_payload",
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("is_break_glass") is True:
        sid_raw = payload.get("sid")
        session_id = UUID(str(sid_raw)) if sid_raw else None
        await record_login_event(
            db,
            event_type="logout",
            success=True,
            user_id=None,
            username_attempted=username,
            session_id=session_id,
            details={"source": "emergency_access", "method": "break_glass"},
        )
        return

    result = await db.execute(
        select(User).where(User.username == username, User.is_deleted == False)
    )
    user = result.scalars().first()
    sid_raw = payload.get("sid")
    session_id: UUID | None = None
    if sid_raw:
        try:
            session_id = UUID(str(sid_raw))
        except (ValueError, TypeError):
            session_id = None

    if user is not None and session_id is not None:
        # Soft revoke: ignore missing / already-revoked
        session = await session_repo.get_by_id(db, session_id)
        if session is not None and session.user_id == user.id and session.revoked_at is None:
            await session_repo.revoke(db, session_id, "logout")
        await record_login_event(
            db,
            event_type="logout",
            success=True,
            user_id=user.id,
            username_attempted=username,
            session_id=session_id,
            details={"method": "logout"},
        )
