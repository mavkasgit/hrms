"""Decode-матрица и write-access политика (#113).

Проверяет два слоя:
1. Канонический decode (session_core.decode_access_token) — все три caller'а
   сохраняют прежние 401-границы для expired/malformed и прежний flow для valid.
2. Write-access политику: admin-only writes (write-gate в middleware),
   read-gate по DENIED_ACCESS_LEVEL в deps.get_current_user.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import AsyncClient, ASGITransport
from jose import jwt as jose_jwt
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.api.deps import CurrentUser, get_current_user
from app.core.config import settings
from app.core.exceptions import HRMSException
from app.main import app, check_write_access_middleware
from app.models.internal_notification import InternalNotification
from app.models.user import User
from app.models.user_session import UserSession
from app.services.auth_token import create_access_token
from app.services.session_service import (
    SessionInactiveError,
    assert_session_active,
    issue_session,
    logout,
)

pytestmark = pytest.mark.asyncio(loop_scope="module")


# ─── helpers ─────────────────────────────────────────────────────────────────


async def _create_user(db: AsyncSession, username: str, role: str) -> User:
    user = User(username=username, role=role, full_name=username.title())
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def _user_session_token(
    db: AsyncSession, username: str, role: str, *, claim_role: str | None = None
) -> tuple[User, UserSession, str]:
    """User + активная сессия + JWT. claim_role переопределяет hrms_access_level."""
    user = await _create_user(db, username, role)
    session = await issue_session(
        db,
        user_id=user.id,
        ip="127.0.0.1",
        user_agent=None,
        login_method="oidc",
        ttl_minutes=60,
    )
    token = create_access_token(username, claim_role or role, username, session_id=session.id)
    return user, session, token


def _expired_token() -> str:
    secret = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    payload = {
        "sub": "admin",
        "username": "admin",
        "hrms_access_level": "admin",
        "exp": int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp()),
    }
    return jose_jwt.encode(payload, secret, algorithm=settings.ALGORITHM)


def _malformed_token() -> str:
    return "not-a-jwt"


def _make_request(*, token: str | None = None, method: str = "POST", path: str = "/api/departments") -> Request:
    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
    }
    return Request(scope)


@pytest.fixture
async def async_client(db_session: AsyncSession):
    """ASGI client bound to the same db_session (savepoint-safe)."""

    async def override_get_db():
        try:
            yield db_session
        finally:
            await db_session.commit()

    from app.core.database import get_db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


# ─── decode matrix: get_current_user ─────────────────────────────────────────


async def test_decode_get_current_user_expired(db_session: AsyncSession):
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(_make_request(token=_expired_token()), db=db_session)
    assert exc_info.value.status_code == 401


async def test_decode_get_current_user_malformed(db_session: AsyncSession):
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(_make_request(token=_malformed_token()), db=db_session)
    assert exc_info.value.status_code == 401


async def test_decode_get_current_user_valid(db_session: AsyncSession):
    user, session, token = await _user_session_token(db_session, "decode_admin", "admin")
    current = await get_current_user(_make_request(token=token), db=db_session)
    assert isinstance(current, CurrentUser)
    assert current.username == user.username
    assert current.role == "admin"
    assert current.session_id == session.id


# ─── decode matrix: check_write_access_middleware ────────────────────────────


async def _call_middleware(token: str | None, method: str = "POST") -> JSONResponse:
    async def call_next(request: Request):
        return JSONResponse(content={"ok": True}, status_code=200)

    return await check_write_access_middleware(_make_request(token=token, method=method), call_next)


async def test_decode_middleware_expired():
    resp = await _call_middleware(token=_expired_token())
    assert isinstance(resp, JSONResponse)
    assert resp.status_code == 401


async def test_decode_middleware_malformed():
    resp = await _call_middleware(token=_malformed_token())
    assert isinstance(resp, JSONResponse)
    assert resp.status_code == 401


async def test_decode_middleware_valid_admin_passes():
    token = create_access_token("mw_admin", "admin", "MW Admin")
    resp = await _call_middleware(token=token)
    assert resp.status_code == 200  # call_next прошёл — write-gate пропустил


async def test_decode_middleware_get_bypasses_write_gate():
    # GET не входит в write-гейт: middleware передаёт в call_next
    resp = await _call_middleware(token=None, method="GET")
    assert resp.status_code == 200


# ─── decode matrix: logout ───────────────────────────────────────────────────


async def test_decode_logout_expired(db_session: AsyncSession):
    with pytest.raises(HRMSException) as exc_info:
        await logout(db=db_session, token=_expired_token())
    assert exc_info.value.status_code == 401


async def test_decode_logout_malformed(db_session: AsyncSession):
    with pytest.raises(HRMSException) as exc_info:
        await logout(db=db_session, token=_malformed_token())
    assert exc_info.value.status_code == 401


async def test_decode_logout_valid_revokes_session(db_session: AsyncSession):
    _, session, token = await _user_session_token(db_session, "logout_user", "admin")
    await logout(db=db_session, token=token)
    # assert_session_active после logout должен бросить
    with pytest.raises(SessionInactiveError):
        await assert_session_active(db_session, session.id)


# ─── write-access policy (интеграция, полный ASGI-стек) ──────────────────────


async def test_write_policy_admin_write_allowed(db_session: AsyncSession, async_client: AsyncClient):
    _, _, token = await _user_session_token(db_session, "w_admin", "admin")
    resp = await async_client.post(
        "/api/departments",
        json={"name": "Write Dept"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


async def test_write_policy_viewer_write_forbidden(db_session: AsyncSession, async_client: AsyncClient):
    _, _, token = await _user_session_token(db_session, "w_viewer", "viewer")
    resp = await async_client.post(
        "/api/departments",
        json={"name": "X"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_write_policy_viewer_read_allowed(db_session: AsyncSession, async_client: AsyncClient):
    _, _, token = await _user_session_token(db_session, "r_viewer", "viewer")
    resp = await async_client.get(
        "/api/internal-notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


async def test_write_policy_no_access_read_forbidden(db_session: AsyncSession, async_client: AsyncClient):
    _, _, token = await _user_session_token(db_session, "r_denied", "viewer", claim_role="no_access")
    resp = await async_client.get(
        "/api/internal-notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_write_policy_viewer_notification_write_forbidden(
    db_session: AsyncSession, async_client: AsyncClient
):
    _, _, token = await _user_session_token(db_session, "n_viewer", "viewer")
    resp = await async_client.post(
        f"/api/internal-notifications/{uuid4().int % 10000}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_write_policy_admin_notification_write_allowed(
    db_session: AsyncSession, async_client: AsyncClient
):
    user, _, token = await _user_session_token(db_session, "n_admin", "admin")
    notif = InternalNotification(user_id=user.id, notification_type="test", title="Test")
    db_session.add(notif)
    await db_session.flush()
    await db_session.refresh(notif)

    resp = await async_client.post(
        f"/api/internal-notifications/{notif.id}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
