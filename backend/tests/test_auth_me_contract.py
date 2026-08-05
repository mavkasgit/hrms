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
        assert data["user_settings_url"] == "http://localhost:9000/if/user/#/settings"
        assert data["sso_dashboard_url"] == "http://localhost:9000/if/user/"


async def test_me_login_events_returns_data(async_client, db_session: AsyncSession):
    uname = f"ev_{uuid_mod.uuid4().hex[:8]}"
    user = await _make_user(db_session, username=uname)

    async with _logged_in_as(uname):
        res = await async_client.get("/api/auth/me/login-events", headers=_auth())
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 0
        assert body["events"] == []


async def test_me_login_events_capped_at_10_with_total(
    async_client, db_session: AsyncSession
):
    """Канон 2.1.0: /auth/me/login-events отдаёт максимум 10 + total (окно 90 дней)."""
    from app.services import session_service

    uname = f"evcap_{uuid_mod.uuid4().hex[:8]}"
    user = await _make_user(db_session, username=uname)
    for _ in range(12):
        await session_service.record_login_event(
            db_session,
            event_type="login_success",
            success=True,
            user_id=user.id,
            username_attempted=uname,
        )
    await db_session.commit()

    async with _logged_in_as(uname):
        res = await async_client.get("/api/auth/me/login-events", headers=_auth())
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 12
        assert len(body["events"]) == 10
        # Самые свежие сверху: id убывают (created_at DESC, tiebreaker id DESC).
        ids = [e["id"] for e in body["events"]]
        assert ids == sorted(ids, reverse=True)


async def test_me_profile_and_avatar_patch(async_client, db_session: AsyncSession):
    uname = f"pt_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname)

    async with _logged_in_as(uname):
        # theme/locale — предпочтения, принимаются (self-service)
        profile = await async_client.patch(
            "/api/auth/me/profile",
            json={"theme": "dark", "locale": "en"},
            headers=_auth(),
        )
        assert profile.status_code == 200
        body = profile.json()
        assert body["theme"] == "dark"
        assert body["locale"] == "en"

        avatar = await async_client.patch(
            "/api/auth/me/avatar",
            json={"avatar_seed": "deadbeef"},
            headers=_auth(),
        )
        assert avatar.status_code == 200
        assert avatar.json()["avatar_seed"] == "deadbeef"


async def test_me_profile_full_name_email_blocked_403(async_client, db_session: AsyncSession):
    """Канон 2.0.0: ФИО/email read-only — PATCH /auth/me/profile → 403."""
    uname = f"ro_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname, full_name="Local Name")

    async with _logged_in_as(uname):
        # full_name в любом виде (даже если значение совпадает) → 403
        for payload in (
            {"full_name": "New Name"},
            {"full_name": "Local Name"},  # совпадает с текущим — всё равно 403
            {"email": "new@example.com"},
            {"full_name": "New Name", "theme": "dark"},
            {"email": "new@example.com", "locale": "ru"},
        ):
            res = await async_client.patch(
                "/api/auth/me/profile",
                json=payload,
                headers=_auth(),
            )
            assert res.status_code == 403, payload
            assert "администратор" in res.json()["detail"]


async def test_me_profile_avatar_fields_rejected_422(async_client, db_session: AsyncSession):
    """Канон 2.0.0: аватар меняется ТОЛЬКО через PATCH /auth/me/avatar.

    Поля avatar_seed/clear_avatar в /auth/me/profile больше не принимаются
    (единый контракт: profile = theme/locale) — Pydantic отдаёт 422.
    """
    uname = f"av_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname)

    async with _logged_in_as(uname):
        for payload in ({"avatar_seed": "deadbeef"}, {"clear_avatar": True}):
            res = await async_client.patch(
                "/api/auth/me/profile",
                json=payload,
                headers=_auth(),
            )
            assert res.status_code == 422, payload


async def test_old_paths_removed(async_client, db_session: AsyncSession):
    """Старые пути миграции удалены (404): /users/me/*, /auth/login-events и ?scope=others."""
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
        assert (await async_client.get(
            "/api/auth/login-events",
            headers=_auth(),
        )).status_code == 404
        assert (await async_client.delete(
            "/api/auth/sessions",
            params={"scope": "others"},
            headers=_auth(),
        )).status_code >= 400
