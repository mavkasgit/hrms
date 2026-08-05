"""Minimal unit/integration tests for sessions foundation (T1)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.services import session_service
from app.services.auth_token import create_access_token
from app.services.session_service import SessionInactiveError, SessionNotFoundError
from app.utils.client_ip import get_client_ip, get_client_ip_from_headers
from app.utils.user_agent import device_label_from_ua


async def _create_user(db: AsyncSession, username: str = "session_user") -> User:
    user = User(
        username=username,
        role="viewer",
        full_name="Session Test User",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


# ─── utils ───────────────────────────────────────────────────────────────────


def test_device_label_chrome_windows():
    ua = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
    assert device_label_from_ua(ua) == "Google Chrome (Windows)"


def test_device_label_firefox_linux():
    ua = "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0"
    assert device_label_from_ua(ua) == "Mozilla Firefox (Linux)"


def test_device_label_empty():
    assert device_label_from_ua(None) == "Неизвестное устройство"
    assert device_label_from_ua("") == "Неизвестное устройство"


def test_client_ip_prefers_x_real_ip():
    ip = get_client_ip_from_headers(
        {"X-Real-IP": "10.0.0.5", "X-Forwarded-For": "1.1.1.1, 2.2.2.2"},
        client_host="127.0.0.1",
        trusted_proxy_count=1,
    )
    assert ip == "10.0.0.5"


def test_client_ip_peels_xff():
    # client, proxy1  — peel 1 from right → client
    ip = get_client_ip_from_headers(
        {"X-Forwarded-For": "203.0.113.10, 10.0.0.1"},
        client_host="127.0.0.1",
        trusted_proxy_count=1,
    )
    assert ip == "203.0.113.10"


def test_client_ip_falls_back_to_host():
    ip = get_client_ip_from_headers({}, client_host="192.168.1.50", trusted_proxy_count=1)
    assert ip == "192.168.1.50"


def test_get_client_ip_request_like():
    request = SimpleNamespace(
        headers={"x-real-ip": "8.8.8.8"},
        client=SimpleNamespace(host="127.0.0.1"),
    )
    assert get_client_ip(request, trusted_proxy_count=1) == "8.8.8.8"


# ─── JWT sid ─────────────────────────────────────────────────────────────────


def test_create_access_token_includes_sid():
    sid = uuid4()
    token = create_access_token("admin", "admin", "Admin", session_id=sid)
    secret = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    payload = jwt.decode(token, secret, algorithms=[settings.ALGORITHM])
    assert payload["sid"] == str(sid)
    assert payload["sub"] == "admin"
    assert payload["hrms_access_level"] == "admin"


def test_create_access_token_without_sid():
    token = create_access_token("admin", "admin", "Admin")
    secret = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    payload = jwt.decode(token, secret, algorithms=[settings.ALGORITHM])
    assert "sid" not in payload


# ─── service + repo (DB) ─────────────────────────────────────────────────────


@pytest.mark.asyncio(loop_scope="module")
async def test_issue_list_revoke_session(db_session: AsyncSession):
    user = await _create_user(db_session)
    ua = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )

    session = await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="10.0.0.5",
        user_agent=ua,
        login_method="oidc",
        ttl_minutes=60,
    )
    assert session.id is not None
    assert session.device_label == "Google Chrome (Windows)"
    assert session.ip_address == "10.0.0.5"
    assert session.revoked_at is None

    active = await session_service.list_sessions(db_session, user_id=user.id)
    assert len(active) == 1
    assert active[0].id == session.id

    # second session
    other = await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="10.0.0.6",
        user_agent="Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
        login_method="oidc",
        ttl_minutes=60,
    )
    active = await session_service.list_sessions(db_session, user_id=user.id)
    assert len(active) == 2

    await session_service.revoke_session(
        db_session,
        user_id=user.id,
        session_id=other.id,
        reason="user_revoke",
    )
    active = await session_service.list_sessions(db_session, user_id=user.id)
    assert len(active) == 1
    assert active[0].id == session.id

    # assert_session_active still ok for current
    loaded = await session_service.assert_session_active(db_session, session.id)
    assert loaded.id == session.id

    # revoked → inactive
    with pytest.raises(SessionInactiveError):
        await session_service.assert_session_active(db_session, other.id)


@pytest.mark.asyncio(loop_scope="module")
async def test_revoke_others_and_all(db_session: AsyncSession):
    user = await _create_user(db_session, username="session_user_2")
    s1 = await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="1.1.1.1",
        user_agent=None,
        login_method="oidc",
        ttl_minutes=30,
    )
    s2 = await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="2.2.2.2",
        user_agent=None,
        login_method="break_glass",
        ttl_minutes=30,
    )
    n = await session_service.revoke_others(
        db_session,
        user_id=user.id,
        current_session_id=s1.id,
        reason="admin",
    )
    assert n == 1
    active = await session_service.list_sessions(db_session, user_id=user.id)
    assert len(active) == 1
    assert active[0].id == s1.id

    n2 = await session_service.revoke_all(db_session, user_id=user.id, reason="logout")
    assert n2 == 1
    active = await session_service.list_sessions(db_session, user_id=user.id)
    assert active == []
    # s2 already revoked earlier; still not active
    assert s2.id is not None


@pytest.mark.asyncio(loop_scope="module")
async def test_assert_session_missing(db_session: AsyncSession):
    with pytest.raises(SessionInactiveError):
        await session_service.assert_session_active(db_session, uuid4())


@pytest.mark.asyncio(loop_scope="module")
async def test_revoke_foreign_session(db_session: AsyncSession):
    u1 = await _create_user(db_session, username="owner_user")
    u2 = await _create_user(db_session, username="other_user")
    s = await session_service.issue_session(
        db_session,
        user_id=u1.id,
        ip=None,
        user_agent=None,
        login_method="oidc",
        ttl_minutes=10,
    )
    with pytest.raises(SessionNotFoundError):
        await session_service.revoke_session(
            db_session,
            user_id=u2.id,
            session_id=s.id,
            reason="user_revoke",
        )


@pytest.mark.asyncio(loop_scope="module")
async def test_record_and_list_login_events(db_session: AsyncSession):
    user = await _create_user(db_session, username="events_user")
    session = await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="9.9.9.9",
        user_agent="Chrome",
        login_method="oidc",
        ttl_minutes=60,
    )
    await session_service.record_login_event(
        db_session,
        event_type="login_success",
        success=True,
        user_id=user.id,
        username_attempted=user.username,
        ip_address="9.9.9.9",
        user_agent="Chrome",
        session_id=session.id,
        details={"method": "oidc"},
    )
    await session_service.record_login_event(
        db_session,
        event_type="login_failure",
        success=False,
        user_id=user.id,
        username_attempted=user.username,
        ip_address="9.9.9.9",
        details={"reason": "invalid_credentials"},
    )
    events = await session_service.list_login_events(db_session, user_id=user.id)
    assert len(events) >= 2
    types = {e.event_type for e in events}
    assert "login_success" in types
    assert "login_failure" in types


@pytest.mark.asyncio(loop_scope="module")
async def test_expired_session_not_active(db_session: AsyncSession):
    user = await _create_user(db_session, username="expired_user")
    # issue with 0-minute ttl → immediately expired (or nearly)
    session = await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip=None,
        user_agent=None,
        login_method="oidc",
        ttl_minutes=0,
    )
    # force expires_at in the past to avoid race
    session.expires_at = datetime.now(timezone.utc) - timedelta(seconds=5)
    db_session.add(session)
    await db_session.flush()

    active = await session_service.list_sessions(db_session, user_id=user.id)
    assert all(s.id != session.id for s in active)

    with pytest.raises(SessionInactiveError):
        await session_service.assert_session_active(db_session, session.id)
