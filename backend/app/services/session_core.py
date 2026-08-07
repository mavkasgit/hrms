"""Shared session core: server-side user sessions + unified JWT issuance.

must-match module across HRMS/KTM (gate: scripts/sync-manifest.json +
scripts/verify-sync.mjs). Keep this file byte-identical in both repos.

Host adapters (backend/app/services/session_service.py) wire their own
domain config — session model fields, device-label parsing, allowed login
methods / revoke reasons / event types, TTL policy and JWT claims — through
:class:`SessionCoreConfig` / :class:`JwtConfig` and keep the project-specific
session orchestration (issue_app_token / complete_login / list_* helpers).

Session capabilities (issue, assert, revoke_by_oidc_sid, logout_jti,
record_login) and the single JWT issuance live here only.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Callable
from uuid import UUID

from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_login_event import UserLoginEvent
from app.models.user_session import UserSession
from app.repositories.login_event_repository import LoginEventRepository
from app.repositories.logout_jti_repository import LogoutJtiRepository
from app.repositories.session_repository import SessionRepository

# const SESSION_CORE_VERSION = "1.0.1"
# The line above is the version source for scripts/verify-sync.mjs
# (its *_VERSION regex requires the literal "const " prefix).
SESSION_CORE_VERSION = "1.0.1"


class TokenError(Exception):
    """Raised when an app JWT cannot be decoded/verified."""


@dataclass(frozen=True)
class JwtConfig:
    """Host-provided signing config for the unified JWT issuance."""

    secret_key: str
    algorithm: str = "HS256"
    default_ttl_minutes: int = 30
    issuer: str | None = None
    audience: str | None = None


def create_access_token(
    config: JwtConfig,
    subject: str,
    *,
    claims: dict[str, Any] | None = None,
    session_id: UUID | str | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """Encode an app JWT (single issuance point for both projects).

    Always sets ``sub``/``username`` and, when given, ``sid``. ``exp`` defaults
    to ``default_ttl_minutes``; ``expires_delta=-1`` produces a long-lived
    token without ``exp`` (dev/test tooling). Domain claims (role,
    hrms_access_level, full_name, …) come from the host via ``claims``.
    """
    payload: dict[str, Any] = {"sub": subject, "username": subject}
    if claims:
        payload.update(claims)
    if session_id is not None:
        payload["sid"] = str(session_id)
    if config.issuer:
        payload["iss"] = config.issuer
    if config.audience:
        payload["aud"] = config.audience
    if expires_delta is not None:
        if expires_delta.total_seconds() != -1:
            payload["exp"] = datetime.now(UTC) + expires_delta
    else:
        payload["exp"] = datetime.now(UTC) + timedelta(minutes=config.default_ttl_minutes)
    return jwt.encode(payload, config.secret_key, algorithm=config.algorithm)


def decode_access_token(config: JwtConfig, token: str) -> dict:
    """Decode + verify an app JWT; raise :class:`TokenError` on any failure."""
    options: dict = {"verify_aud": False}
    kwargs: dict = {}
    if config.audience:
        options["verify_aud"] = True
        kwargs["audience"] = config.audience
    try:
        return jwt.decode(
            token,
            config.secret_key,
            algorithms=[config.algorithm],
            options=options,
            **kwargs,
        )
    except JWTError as exc:
        raise TokenError("Invalid token") from exc


class SessionCoreError(Exception):
    """Base error for session-core domain failures (host maps to its own type)."""

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass(frozen=True)
class SessionCoreConfig:
    """Host-wired dependencies and domain knobs for the session core."""

    session_repo: SessionRepository
    login_event_repo: LoginEventRepository
    logout_jti_repo: LogoutJtiRepository
    device_label_fn: Callable[[str | None], str | None]
    login_methods: frozenset[str]
    revoke_reasons: frozenset[str]
    event_types: frozenset[str]
    last_seen_throttle_seconds: int
    min_ttl_minutes: int = 1


async def issue_session(
    config: SessionCoreConfig,
    db: AsyncSession,
    *,
    user_id: int,
    login_method: str,
    ttl_minutes: int,
    ip: str | None = None,
    user_agent: str | None = None,
    oidc_sid: str | None = None,
) -> UserSession:
    """Insert a session row; expires_at = now + ttl; device_label from UA."""
    if login_method not in config.login_methods:
        raise SessionCoreError(
            f"Unknown login_method: {login_method}", "invalid_login_method"
        )
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=max(config.min_ttl_minutes, int(ttl_minutes)))
    return await config.session_repo.create_session(
        db,
        user_id=user_id,
        expires_at=expires_at,
        login_method=login_method,
        ip_address=ip,
        user_agent=user_agent,
        device_label=config.device_label_fn(user_agent),
        last_seen_at=now,
        oidc_sid=oidc_sid,
    )


async def assert_session_active(
    config: SessionCoreConfig,
    db: AsyncSession,
    session_id: UUID,
) -> UserSession:
    """Raise :class:`SessionCoreError` if missing/revoked/expired; throttled touch."""
    session = await config.session_repo.get_by_id(db, session_id)
    if session is None:
        raise SessionCoreError("Session not found", "session_not_found")
    if session.revoked_at is not None:
        raise SessionCoreError("Session revoked", "session_revoked")
    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    if expires <= now:
        raise SessionCoreError("Session expired", "session_expired")

    last_seen = session.last_seen_at
    if last_seen is not None and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=UTC)
    if (
        last_seen is None
        or (now - last_seen).total_seconds() >= config.last_seen_throttle_seconds
    ):
        await config.session_repo.touch_last_seen(db, session_id, when=now)
        session.last_seen_at = now

    return session


async def revoke_by_oidc_sid(
    config: SessionCoreConfig,
    db: AsyncSession,
    *,
    user_id: int,
    oidc_sid: str,
    reason: str,
) -> list[UUID]:
    """Revoke sessions of user tied to IdP sid (back-channel SLO). Returns ids."""
    if reason not in config.revoke_reasons:
        raise SessionCoreError(f"Unknown revoke reason: {reason}", "invalid_revoke_reason")
    return await config.session_repo.revoke_active_by_oidc_sid(
        db, user_id=user_id, oidc_sid=oidc_sid, reason=reason
    )


# --- Logout JTI replay protection ---


async def is_logout_jti_used(config: SessionCoreConfig, db: AsyncSession, jti: str) -> bool:
    return await config.logout_jti_repo.is_used(db, jti)


async def mark_logout_jti_used(
    config: SessionCoreConfig,
    db: AsyncSession,
    jti: str,
    *,
    expires_at: datetime,
) -> None:
    await config.logout_jti_repo.mark_used(db, jti, expires_at=expires_at)


async def cleanup_logout_jti(config: SessionCoreConfig, db: AsyncSession) -> int:
    """Opportunistic purge of consumed jti with expired exp."""
    return await config.logout_jti_repo.delete_expired(db)


# --- Login events (audit) ---


async def record_login(
    config: SessionCoreConfig,
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
    """Append an audit event; validate ``event_type`` against host config."""
    if event_type not in config.event_types:
        raise SessionCoreError(f"Unknown event_type: {event_type}", "invalid_event_type")
    return await config.login_event_repo.create_event(
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
