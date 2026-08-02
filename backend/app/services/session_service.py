"""Business logic for user sessions and login audit events."""

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
from app.utils.user_agent import device_label_from_ua

# --- string constants (validation / storage; not DB enums) ---

LOGIN_METHODS = frozenset(
    {
        "password",
        "invite",
        "oidc",
        "break_glass",
    }
)
EVENT_TYPES = frozenset({"login_success", "login_failure", "logout", "session_revoke"})
REVOKE_REASONS = frozenset(
    {"logout", "user_revoke", "password_change", "admin", "expired", "backchannel_logout"}
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
    if login_method not in LOGIN_METHODS:
        raise HRMSException(
            f"Неизвестный login_method: {login_method}",
            "invalid_login_method",
            status_code=400,
        )
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=ttl_minutes)
    label = device_label_from_ua(user_agent)
    return await session_repo.create_session(
        db,
        user_id=user_id,
        expires_at=expires_at,
        login_method=login_method,
        ip_address=ip,
        user_agent=user_agent,
        device_label=label,
        last_seen_at=now,
        oidc_sid=oidc_sid,
    )


async def assert_session_active(db: AsyncSession, session_id: UUID) -> UserSession:
    """Raise domain error if missing/revoked/expired. Throttled last_seen update."""
    session = await session_repo.get_by_id(db, session_id)
    if session is None:
        raise SessionInactiveError("Сессия не найдена", "session_not_found")
    now = datetime.now(timezone.utc)
    if session.revoked_at is not None:
        raise SessionInactiveError("Сессия отозвана", "session_revoked")
    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= now:
        raise SessionInactiveError("Сессия истекла", "session_expired")

    last_seen = session.last_seen_at
    if last_seen is not None and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    throttle = settings.SESSION_LAST_SEEN_THROTTLE_SECONDS
    if last_seen is None or (now - last_seen).total_seconds() >= throttle:
        await session_repo.touch_last_seen(db, session_id, when=now)
        session.last_seen_at = now

    return session


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
    if reason not in REVOKE_REASONS:
        raise HRMSException(
            f"Неизвестная причина отзыва: {reason}",
            "invalid_revoke_reason",
            status_code=400,
        )
    return await session_repo.revoke_active_by_oidc_sid(
        db, user_id=user_id, oidc_sid=oidc_sid, reason=reason
    )


async def is_logout_jti_used(db: AsyncSession, jti: str) -> bool:
    return await logout_jti_repo.is_used(db, jti)


async def mark_logout_jti_used(
    db: AsyncSession, jti: str, *, expires_at: datetime
) -> None:
    await logout_jti_repo.mark_used(db, jti, expires_at=expires_at)


async def cleanup_logout_jti(db: AsyncSession) -> int:
    """Opportunistic purge потреблённых jti с истёкшим exp."""
    return await logout_jti_repo.delete_expired(db)


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
    if event_type not in EVENT_TYPES:
        raise HRMSException(
            f"Неизвестный event_type: {event_type}",
            "invalid_event_type",
            status_code=400,
        )
    return await login_event_repo.create_event(
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


async def list_login_events(
    db: AsyncSession,
    *,
    user_id: int,
    limit: int = 50,
) -> list[UserLoginEvent]:
    days = settings.LOGIN_EVENTS_RETENTION_DAYS
    since = datetime.now(timezone.utc) - timedelta(days=days)
    safe_limit = max(1, min(int(limit), 200))
    return await login_event_repo.list_for_user(db, user_id, since=since, limit=safe_limit)


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
    from app.services.auth_token import create_access_token

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
    token = create_access_token(
        username=user.username,
        role=user.role,
        full_name=full_name,
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
