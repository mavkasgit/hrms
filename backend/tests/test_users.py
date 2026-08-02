"""#35: админ-IAM удалён — CRUD пользователей в API недоступен (404).

Локальная запись пользователя создаётся только JIT при первом OIDC-входе;
жизненный цикл аккаунта управляется в IdP (Authentik).
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.main import app

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession):
    """ASGI client bound to isolated test db_session (not .env.dev :5435)."""

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


def _get_auth_headers():
    return {"Authorization": "Bearer admin"}


async def test_create_user_removed(async_client):
    """POST /api/users удалён → 404."""
    payload = {"username": "someone", "full_name": "Кто-то", "role": "viewer"}
    response = await async_client.post("/api/users", json=payload, headers=_get_auth_headers())
    assert response.status_code == 404


async def test_update_user_removed(async_client):
    """PUT /api/users/{id} удалён → 404."""
    response = await async_client.put(
        "/api/users/1", json={"role": "admin"}, headers=_get_auth_headers()
    )
    assert response.status_code == 404


async def test_delete_user_removed(async_client):
    """DELETE /api/users/{id} удалён → 404."""
    response = await async_client.delete("/api/users/1", headers=_get_auth_headers())
    assert response.status_code == 404


async def test_generate_invite_removed(async_client):
    """POST /api/users/{id}/generate-invite удалён → 404."""
    response = await async_client.post(
        "/api/users/1/generate-invite", headers=_get_auth_headers()
    )
    assert response.status_code == 404


async def test_list_users_removed(async_client):
    """GET /api/users удалён вместе с CRUD (каталог — в IdP)."""
    response = await async_client.get("/api/users", headers=_get_auth_headers())
    assert response.status_code == 404
