"""SSO-D: IdP admin proxy + local role guard when OIDC enabled."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.main import app

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
def oidc_on():
    original = {
        "AUTH_OIDC_ENABLED": settings.AUTH_OIDC_ENABLED,
        "AUTHENTIK_API_URL": settings.AUTHENTIK_API_URL,
        "AUTHENTIK_API_TOKEN": settings.AUTHENTIK_API_TOKEN,
        "AUTHENTIK_PUBLIC_URL": settings.AUTHENTIK_PUBLIC_URL,
    }
    settings.AUTH_OIDC_ENABLED = True
    settings.AUTHENTIK_API_URL = "http://localhost:9000"
    settings.AUTHENTIK_API_TOKEN = "test-token"
    settings.AUTHENTIK_PUBLIC_URL = "http://localhost:9000"
    yield
    for k, v in original.items():
        setattr(settings, k, v)


@pytest.fixture
def oidc_off():
    original = settings.AUTH_OIDC_ENABLED
    settings.AUTH_OIDC_ENABLED = False
    yield
    settings.AUTH_OIDC_ENABLED = original


async def test_update_role_allowed_when_oidc(async_client, db_session: AsyncSession, oidc_on):
    """App SoT: create with explicit admin + PUT role change work under OIDC."""
    import uuid

    username = f"idp_role_{uuid.uuid4().hex[:8]}"
    create = await async_client.post(
        "/api/users",
        json={"username": username, "full_name": "IdP Role User", "role": "admin"},
        headers=_auth(),
    )
    assert create.status_code == 201
    body = create.json()
    assert body["role"] == "admin"
    assert "authentik_sub" in body
    assert body["authentik_sub"] is None
    user_id = body["id"]

    resp = await async_client.put(
        f"/api/users/{user_id}",
        json={"role": "viewer"},
        headers=_auth(),
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "viewer"

    resp_up = await async_client.put(
        f"/api/users/{user_id}",
        json={"role": "admin"},
        headers=_auth(),
    )
    assert resp_up.status_code == 200
    assert resp_up.json()["role"] == "admin"

    await async_client.delete(f"/api/users/{user_id}", headers=_auth())


async def test_update_role_allowed_when_oidc_off(async_client, oidc_off):
    import uuid

    username = f"local_role_{uuid.uuid4().hex[:8]}"
    create = await async_client.post(
        "/api/users",
        json={"username": username, "full_name": "Local Role User", "role": "viewer"},
        headers=_auth(),
    )
    assert create.status_code == 201
    assert create.json()["role"] == "viewer"
    user_id = create.json()["id"]

    resp = await async_client.put(
        f"/api/users/{user_id}",
        json={"role": "admin"},
        headers=_auth(),
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"

    await async_client.delete(f"/api/users/{user_id}", headers=_auth())


async def test_idp_config_and_links(async_client, oidc_on):
    cfg = await async_client.get("/api/idp/config", headers=_auth())
    assert cfg.status_code == 200
    data = cfg.json()
    assert data["oidc_enabled"] is True
    assert data["idp_admin_enabled"] is True
    assert data["user_settings_url"] == "http://localhost:9000/if/user/"
    assert data["admin_url"] == "http://localhost:9000/if/admin/"
    assert data["ops_url"] == "http://localhost:9010"
    assert "hrms-admin" in data["groups"]

    links = await async_client.get("/api/idp/links", headers=_auth())
    assert links.status_code == 200
    assert links.json()["user_settings_url"] == "http://localhost:9000/if/user/"


async def test_idp_users_mocked(async_client, oidc_on):
    mock_items = [
        {
            "pk": 42,
            "username": "alice",
            "name": "Alice",
            "email": "a@example.com",
            "is_active": True,
            "groups": ["hrms-viewer"],
        }
    ]
    with patch(
        "app.services.authentik_admin_service.list_idp_users",
        new=AsyncMock(return_value=mock_items),
    ):
        resp = await async_client.get("/api/idp/users", headers=_auth())
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["username"] == "alice"
    assert items[0]["access_level"] == "viewer"


async def test_idp_set_access_mocked(async_client, oidc_on):
    mock_result = {
        "pk": 42,
        "username": "alice",
        "name": "Alice",
        "email": "a@example.com",
        "is_active": True,
        "groups": ["hrms-admin"],
        "access_level": "admin",
    }
    with patch(
        "app.services.authentik_admin_service.set_user_access",
        new=AsyncMock(return_value=mock_result),
    ):
        resp = await async_client.put(
            "/api/idp/users/42/access",
            json={"access_level": "admin"},
            headers=_auth(),
        )
    assert resp.status_code == 200
    assert resp.json()["access_level"] == "admin"
    assert "hrms-admin" in resp.json()["groups"]


async def test_idp_users_503_without_token(async_client):
    original = {
        "AUTH_OIDC_ENABLED": settings.AUTH_OIDC_ENABLED,
        "AUTHENTIK_API_TOKEN": settings.AUTHENTIK_API_TOKEN,
        "AUTHENTIK_API_URL": settings.AUTHENTIK_API_URL,
    }
    settings.AUTH_OIDC_ENABLED = True
    settings.AUTHENTIK_API_URL = "http://localhost:9000"
    settings.AUTHENTIK_API_TOKEN = ""
    try:
        resp = await async_client.get("/api/idp/users", headers=_auth())
        assert resp.status_code == 503
        cfg = await async_client.get("/api/idp/config", headers=_auth())
        assert cfg.status_code == 200
        assert cfg.json()["idp_admin_enabled"] is False
    finally:
        for k, v in original.items():
            setattr(settings, k, v)
