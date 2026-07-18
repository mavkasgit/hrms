"""Unified profile: Authentik SoT for full_name + avatar_seed (mock Admin API)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.user_auth import generate_avatar_seed
from app.main import app
from app.models.user import User
from app.core.constants import SSO_BYPASS_HASH

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


@pytest.fixture
def idp_api_on():
    original = {
        "AUTH_OIDC_ENABLED": settings.AUTH_OIDC_ENABLED,
        "AUTHENTIK_API_URL": settings.AUTHENTIK_API_URL,
        "AUTHENTIK_API_TOKEN": settings.AUTHENTIK_API_TOKEN,
    }
    settings.AUTH_OIDC_ENABLED = True
    settings.AUTHENTIK_API_URL = "http://localhost:9000"
    settings.AUTHENTIK_API_TOKEN = "test-token"
    yield
    for k, v in original.items():
        setattr(settings, k, v)


@pytest.fixture
def idp_api_off():
    original = {
        "AUTH_OIDC_ENABLED": settings.AUTH_OIDC_ENABLED,
        "AUTHENTIK_API_TOKEN": settings.AUTHENTIK_API_TOKEN,
    }
    settings.AUTH_OIDC_ENABLED = False
    settings.AUTHENTIK_API_TOKEN = ""
    yield
    for k, v in original.items():
        setattr(settings, k, v)


async def _make_user(
    db: AsyncSession,
    *,
    username: str,
    full_name: str = "Local Name",
    avatar_seed: str | None = "aabbccdd",
    authentik_sub: str | None = None,
) -> User:
    user = User(
        username=username,
        password_hash=SSO_BYPASS_HASH,
        full_name=full_name,
        role="admin",
        avatar_seed=avatar_seed,
        authentik_sub=authentik_sub,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _ak_user(
    *,
    pk: int = 42,
    uuid: str = "sub-uuid-1",
    name: str = "IdP Name",
    seed: str | None = "11223344",
) -> dict:
    attrs = {}
    if seed is not None:
        attrs["profile_avatar_seed"] = seed
    return {
        "pk": pk,
        "uuid": uuid,
        "username": "idp_user",
        "name": name,
        "email": "u@example.com",
        "attributes": attrs,
        "is_active": True,
    }


async def test_avatar_local_only_without_sub(async_client, db_session: AsyncSession, idp_api_on):
    """No authentik_sub → write only local cache even if API configured."""
    import uuid as uuid_mod

    uname = f"up_local_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname, authentik_sub=None)

    # Login as this user via DEV_BYPASS style: use admin path — create token?
    # Project uses Bearer admin for admin user. Patch as the created user via username
    # by temporarily using deps — simpler: call service layer / use admin and change endpoint
    # for users without login of custom user: use patch with mock get_current_user.

    from app.api.deps import get_current_user, CurrentUser

    async def override_user():
        return CurrentUser(uname, role="admin", full_name="Local Name")

    app.dependency_overrides[get_current_user] = override_user
    try:
        with patch(
            "app.services.unified_profile_service.push_profile_by_sub",
            new_callable=AsyncMock,
        ) as push:
            res = await async_client.patch(
                "/api/users/me/avatar",
                json={"avatar_seed": "deadbeef"},
                headers=_auth(),
            )
            assert res.status_code == 200
            assert res.json()["avatar_seed"] == "deadbeef"
            push.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_avatar_pushes_to_authentik(async_client, db_session: AsyncSession, idp_api_on):
    import uuid as uuid_mod

    from app.api.deps import get_current_user, CurrentUser
    from app.services.unified_profile_service import UnifiedProfile

    uname = f"up_ak_{uuid_mod.uuid4().hex[:8]}"
    sub = f"sub-{uuid_mod.uuid4().hex}"
    await _make_user(db_session, username=uname, authentik_sub=sub)

    async def override_user():
        return CurrentUser(uname, role="admin", full_name="Local Name")

    app.dependency_overrides[get_current_user] = override_user
    try:
        with patch(
            "app.services.unified_profile_service.push_profile_by_sub",
            new_callable=AsyncMock,
            return_value=UnifiedProfile(
                full_name="Local Name",
                avatar_seed="cafebabe",
                authentik_pk=7,
                source="idp",
            ),
        ) as push:
            res = await async_client.patch(
                "/api/users/me/avatar",
                json={"avatar_seed": "cafebabe"},
                headers=_auth(),
            )
            assert res.status_code == 200
            assert res.json()["avatar_seed"] == "cafebabe"
            push.assert_awaited_once()
            assert push.await_args.args[0] == sub
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_profile_name_push(async_client, db_session: AsyncSession, idp_api_on):
    import uuid as uuid_mod

    from app.api.deps import get_current_user, CurrentUser
    from app.services.unified_profile_service import UnifiedProfile

    uname = f"up_name_{uuid_mod.uuid4().hex[:8]}"
    sub = f"sub-{uuid_mod.uuid4().hex}"
    await _make_user(db_session, username=uname, authentik_sub=sub)

    async def override_user():
        return CurrentUser(uname, role="admin", full_name="Old")

    app.dependency_overrides[get_current_user] = override_user
    try:
        with patch(
            "app.services.unified_profile_service.push_profile_by_sub",
            new_callable=AsyncMock,
            return_value=UnifiedProfile(
                full_name="New Name",
                avatar_seed="aabbccdd",
                authentik_pk=1,
                source="idp",
            ),
        ) as push:
            res = await async_client.patch(
                "/api/users/me/profile",
                json={"full_name": "New Name"},
                headers=_auth(),
            )
            assert res.status_code == 200
            body = res.json()
            assert body["full_name"] == "New Name"
            push.assert_awaited_once()
            assert push.await_args.kwargs.get("full_name") == "New Name"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_me_pulls_from_idp(async_client, db_session: AsyncSession, idp_api_on):
    import uuid as uuid_mod

    from app.api.deps import get_current_user, CurrentUser
    from app.services.unified_profile_service import UnifiedProfile

    uname = f"up_me_{uuid_mod.uuid4().hex[:8]}"
    sub = f"sub-{uuid_mod.uuid4().hex}"
    await _make_user(
        db_session,
        username=uname,
        full_name="Stale",
        avatar_seed="00000000",
        authentik_sub=sub,
    )

    async def override_user():
        return CurrentUser(uname, role="admin", full_name="Stale")

    app.dependency_overrides[get_current_user] = override_user
    try:
        with patch(
            "app.services.unified_profile_service.sync_local_from_idp",
            new_callable=AsyncMock,
            return_value=UnifiedProfile(
                full_name="Fresh IdP",
                avatar_seed="ffffffff",
                authentik_pk=9,
                source="idp",
            ),
        ):
            res = await async_client.get("/api/auth/me", headers=_auth())
            assert res.status_code == 200
            body = res.json()
            assert body["full_name"] == "Fresh IdP"
            assert body["avatar_seed"] == "ffffffff"
            assert body["profile_sot"] == "authentik"
            assert body["authentik_linked"] is True
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_me_local_sot_when_api_off(async_client, db_session: AsyncSession, idp_api_off):
    import uuid as uuid_mod

    from app.api.deps import get_current_user, CurrentUser

    uname = f"up_off_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname, authentik_sub="sub-x")

    async def override_user():
        return CurrentUser(uname, role="admin", full_name="Local Name")

    app.dependency_overrides[get_current_user] = override_user
    try:
        res = await async_client.get("/api/auth/me", headers=_auth())
        assert res.status_code == 200
        assert res.json()["profile_sot"] == "local"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_push_profile_by_sub_http_shape(idp_api_on):
    """Unit: PATCH body maps name + email + attributes (avatar/locale/theme)."""
    from app.services import unified_profile_service as ups

    ak = _ak_user(seed="oldseed1")
    calls: list[tuple] = []

    async def fake_request(method, path, *, params=None, json_body=None):
        calls.append((method, path, params, json_body))
        if method == "GET" and path == "/core/users/":
            return {"results": [ak]}
        if method == "PATCH":
            out = dict(ak)
            if json_body:
                if "name" in json_body:
                    out["name"] = json_body["name"]
                if "email" in json_body:
                    out["email"] = json_body["email"]
                if "attributes" in json_body:
                    out["attributes"] = json_body["attributes"]
            return out
        if method == "GET" and path.startswith("/core/users/"):
            return ak
        return {}

    with patch("app.services.unified_profile_service._request", side_effect=fake_request):
        result = await ups.push_profile_by_sub(
            "sub-uuid-1",
            full_name="Patched",
            avatar_seed="newseed99",
            email="new@example.com",
            locale="en",
            theme="dark",
        )
    assert result.full_name == "Patched"
    assert result.avatar_seed == "newseed99"
    assert result.email == "new@example.com"
    assert result.locale == "en"
    assert result.theme == "dark"
    patch_calls = [c for c in calls if c[0] == "PATCH"]
    assert len(patch_calls) == 1
    body = patch_calls[0][3]
    assert body["name"] == "Patched"
    assert body["email"] == "new@example.com"
    assert body["attributes"]["profile_avatar_seed"] == "newseed99"
    assert body["attributes"]["profile_locale"] == "en"
    assert body["attributes"]["profile_theme"] == "dark"


async def test_profile_bad_theme_validation(async_client, db_session: AsyncSession, idp_api_off):
    """Invalid theme → 422 (Pydantic)."""
    import uuid as uuid_mod

    from app.api.deps import get_current_user, CurrentUser

    uname = f"up_theme_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname)

    async def override_user():
        return CurrentUser(uname, role="admin", full_name="Local Name")

    app.dependency_overrides[get_current_user] = override_user
    try:
        res = await async_client.patch(
            "/api/users/me/profile",
            json={"theme": "neon"},
            headers=_auth(),
        )
        assert res.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_profile_locale_theme_local(async_client, db_session: AsyncSession, idp_api_off):
    """Without IdP: locale/theme cache to local DB."""
    import uuid as uuid_mod

    from app.api.deps import get_current_user, CurrentUser

    uname = f"up_lt_{uuid_mod.uuid4().hex[:8]}"
    await _make_user(db_session, username=uname)

    async def override_user():
        return CurrentUser(uname, role="admin", full_name="Local Name")

    app.dependency_overrides[get_current_user] = override_user
    try:
        res = await async_client.patch(
            "/api/users/me/profile",
            json={"locale": "ru", "theme": "light"},
            headers=_auth(),
        )
        assert res.status_code == 200
        body = res.json()
        assert body["locale"] == "ru"
        assert body["theme"] == "light"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
