"""Единый контракт /auth/me/* (#40): новые пути работают, старые удалены."""

from __future__ import annotations

import uuid as uuid_mod
from contextlib import asynccontextmanager

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.models.user import User

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession):
    async def override_get_db():
        try:
            yield db_session
        finally:
            await db_session.commit()

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


def _auth():
    return {"Authorization": "Bearer admin"}


@asynccontextmanager
async def _logged_in_as(username: str):
    """Подмена текущего пользователя на время запроса(ов) в тесте."""

    async def override():
        return CurrentUser(username, role="admin", full_name="Local Name")

    app.dependency_overrides[get_current_user] = override
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def _make_user(
    db: AsyncSession,
    *,
    username: str,
    full_name: str = "Local Name",
    avatar_seed: str | None = "aabbccdd",
) -> User:
    user = User(username=username, full_name=full_name, role="admin", avatar_seed=avatar_seed)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def oidc_links_on():
    original = {
        "AUTH_OIDC_ENABLED": settings.AUTH_OIDC_ENABLED,
        "AUTHENTIK_PUBLIC_URL": settings.AUTHENTIK_PUBLIC_URL,
    }
    settings.AUTH_OIDC_ENABLED = True
    settings.AUTHENTIK_PUBLIC_URL = "http://localhost:9000"
    yield
    for k, v in original.items():
        setattr(settings, k, v)


async def test_me_links_returns_data(async_client, db_session: AsyncSession, oidc_links_on):
    uname = f"links_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname)

    async with _logged_in_as(uname):
        res = await async_client.get("/api/auth/me/links", headers=_auth())
        assert res.status_code == 200
        data = res.json()
        assert data["oidc_enabled"] is True
        assert data["user_settings_url"] == "http://localhost:9000/if/user/"


async def test_me_login_events_returns_data(async_client, db_session: AsyncSession):
    uname = f"ev_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname)

    async with _logged_in_as(uname):
        res = await async_client.get("/api/auth/me/login-events", headers=_auth())
        assert res.status_code == 200
        assert isinstance(res.json(), list)


async def test_me_profile_and_avatar_patch(async_client, db_session: AsyncSession):
    uname = f"pt_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname)

    async with _logged_in_as(uname):
        profile = await async_client.patch(
            "/api/auth/me/profile",
            json={"full_name": "Updated", "theme": "dark", "locale": "en"},
            headers=_auth(),
        )
        assert profile.status_code == 200
        body = profile.json()
        assert body["full_name"] == "Updated"
        assert body["theme"] == "dark"
        assert body["locale"] == "en"

        avatar = await async_client.patch(
            "/api/auth/me/avatar",
            json={"avatar_seed": "deadbeef"},
            headers=_auth(),
        )
        assert avatar.status_code == 200
        assert avatar.json()["avatar_seed"] == "deadbeef"


async def test_old_paths_removed(async_client, db_session: AsyncSession):
    """Старые пути миграции удалены (404): /users/me/* и ?scope=others."""
    uname = f"old_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname)

    async with _logged_in_as(uname):
        assert (await async_client.patch(
            "/api/users/me/profile",
            json={"full_name": "X"},
            headers=_auth(),
        )).status_code == 404
        assert (await async_client.patch(
            "/api/users/me/avatar",
            json={"avatar_seed": "x"},
            headers=_auth(),
        )).status_code == 404
        assert (await async_client.delete(
            "/api/auth/sessions",
            params={"scope": "others"},
            headers=_auth(),
        )).status_code >= 400
