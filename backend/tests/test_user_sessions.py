"""API tests: user sessions + login history (T4).

Covers session issue (sid), revoke → 401, logout, login events, revoke others.
"""

from __future__ import annotations

import uuid

import bcrypt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.main import app
from app.models.user import User
from app.services.auth_token import create_access_token
from app.services import session_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession):
    """ASGI client bound to the same db_session (savepoint-safe)."""

    async def override_get_db():
        try:
            yield db_session
        finally:
            await db_session.commit()

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _uid(prefix: str = "sess") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


async def _make_user(
    db: AsyncSession,
    *,
    username: str | None = None,
    password: str = "secretpassword123",
    role: str = "viewer",
) -> tuple[User, str]:
    """Create user with bcrypt password. Returns (user, plain_password)."""
    name = username or _uid("user")
    user = User(
        username=name,
        full_name=f"Sessions {name}",
        role=role,
        password_hash=bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode(
            "utf-8"
        ),
        is_deleted=False,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    await db.commit()
    return user, password


async def _login(
    db: AsyncSession, user: User
) -> tuple[str, dict]:
    sess = await session_service.issue_session(
        db=db,
        user_id=user.id,
        ip="127.0.0.1",
        user_agent="pytest-sessions-agent",
        login_method="password",
        ttl_minutes=60,
    )
    token = create_access_token(
        username=user.username,
        role=user.role,
        full_name=user.full_name or user.username,
        session_id=sess.id,
    )
    claims = jwt.get_unverified_claims(token)
    return token, claims


# ─── cases ───────────────────────────────────────────────────────────────────


async def test_login_creates_session_and_sid(async_client: AsyncClient, db_session):
    user, password = await _make_user(db_session)

    token, claims = await _login(db_session, user)
    assert claims.get("sid"), "JWT must include sid claim"

    sessions_resp = await async_client.get(
        "/api/auth/sessions", headers=_auth(token)
    )
    assert sessions_resp.status_code == 200
    sessions = sessions_resp.json()
    assert len(sessions) >= 1
    current = [s for s in sessions if s.get("is_current")]
    assert len(current) == 1
    assert current[0]["id"] == claims["sid"]


async def test_revoke_session_rejects_token(async_client: AsyncClient, db_session):
    user, password = await _make_user(db_session)
    token, claims = await _login(db_session, user)
    sid = claims["sid"]

    me_ok = await async_client.get("/api/auth/me", headers=_auth(token))
    assert me_ok.status_code == 200

    rev = await async_client.delete(
        f"/api/auth/sessions/{sid}", headers=_auth(token)
    )
    assert rev.status_code == 204

    me_after = await async_client.get("/api/auth/me", headers=_auth(token))
    assert me_after.status_code == 401
    assert "session" in me_after.json()["detail"].lower() or me_after.json()[
        "detail"
    ] in ("Session revoked or expired", "Session required")


async def test_logout_revokes_current(async_client: AsyncClient, db_session):
    user, password = await _make_user(db_session)
    token, _ = await _login(db_session, user)

    logout_resp = await async_client.post(
        "/api/auth/logout", headers=_auth(token)
    )
    assert logout_resp.status_code == 204

    me_after = await async_client.get("/api/auth/me", headers=_auth(token))
    assert me_after.status_code == 401


async def test_failed_login_event(async_client: AsyncClient, db_session):
    user, password = await _make_user(db_session)

    fail = await async_client.post(
        "/api/auth/login",
        json={"username": user.username, "password": "wrong-password-xxx"},
    )
    assert fail.status_code == 403

    token, _ = await _login(db_session, user)

    events_resp = await async_client.get(
        "/api/auth/login-events", headers=_auth(token)
    )
    assert events_resp.status_code == 200


async def test_revoke_others_keeps_current(async_client: AsyncClient, db_session):
    user, password = await _make_user(db_session)

    token_a, claims_a = await _login(db_session, user)
    token_b, claims_b = await _login(db_session, user)
    assert claims_a["sid"] != claims_b["sid"]

    rev = await async_client.delete(
        "/api/auth/sessions",
        params={"scope": "others"},
        headers=_auth(token_a),
    )
    assert rev.status_code == 204

    me_a = await async_client.get("/api/auth/me", headers=_auth(token_a))
    assert me_a.status_code == 200
    assert me_a.json()["username"] == user.username

    me_b = await async_client.get("/api/auth/me", headers=_auth(token_b))
    assert me_b.status_code == 401


async def test_legacy_token_without_sid(async_client: AsyncClient, db_session):
    user, _ = await _make_user(db_session)
    token = create_access_token(
        username=user.username,
        role=user.role,
        full_name=user.full_name or user.username,
        session_id=None,
    )
    claims = jwt.get_unverified_claims(token)
    assert "sid" not in claims

    me = await async_client.get("/api/auth/me", headers=_auth(token))
    assert me.status_code == 401
    assert me.json()["detail"] == "Session required"
