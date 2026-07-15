import pytest
import pytest_asyncio
from pydantic import ValidationError
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.schemas.user import UserCreate, UserUpdate

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def async_client():
    # Uses app.core.database (dev DB). dispose_app_engine_between_modules
    # in conftest keeps the pool valid across module event loops / xdist.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


def _get_auth_headers():
    return {"Authorization": "Bearer admin"}


def test_user_schema_username_validation():
    """Тест валидации логина в схеме Pydantic."""
    # Корректные логины
    for username in ["ivanov_i", "john.doe", "user-1", "admin"]:
        schema = UserCreate(username=username, full_name="Иванов Иван", role="viewer")
        assert schema.username == username

    # Некорректные логины (должны падать)
    for username in ["иванов", "john doe", "user!", "admin#", ""]:
        with pytest.raises(ValidationError):
            UserCreate(username=username, full_name="Иванов Иван", role="viewer")


async def test_create_user_api_role_and_validation(async_client):
    """Тест создания пользователя через API с проверкой валидации и роли."""
    import uuid
    username = f"user_{uuid.uuid4().hex[:8]}"
    # Создание с корректными данными
    payload = {
        "username": username,
        "full_name": "Тестовый Пользователь",
        "role": "viewer",
    }
    response = await async_client.post("/api/users", json=payload, headers=_get_auth_headers())
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == username
    assert data["role"] == "viewer"
    user_id = data["id"]

    # Попытка создания с некорректным логином
    payload_invalid = {
        "username": "некорректный логин",
        "full_name": "Тестовый Пользователь 2",
        "role": "admin",
    }
    response_invalid = await async_client.post("/api/users", json=payload_invalid, headers=_get_auth_headers())
    assert response_invalid.status_code == 422

    # Редактирование роли и пароля
    update_payload = {
        "role": "admin",
        "password": "newpassword123",
    }
    response_update = await async_client.put(f"/api/users/{user_id}", json=update_payload, headers=_get_auth_headers())
    assert response_update.status_code == 200
    updated_data = response_update.json()
    assert updated_data["role"] == "admin"

    # Удаление
    response_delete = await async_client.delete(f"/api/users/{user_id}", headers=_get_auth_headers())
    assert response_delete.status_code == 204

    # Попытка запроса от имени удаленного пользователя (должно возвращать 401)
    from app.services.auth_token import create_access_token
    token = create_access_token(username=username, role="admin", full_name="Deleted User")
    response_me = await async_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response_me.status_code == 401
    assert response_me.json()["detail"] == "Пользователь удален из системы"


async def test_admin_user_protection(async_client):
    """Тест защиты встроенного администратора: не выводится в списке и нельзя удалить."""
    # Проверка, что 'admin' нет в списке пользователей
    response_list = await async_client.get("/api/users", headers=_get_auth_headers())
    assert response_list.status_code == 200
    usernames = [u["username"] for u in response_list.json()]
    assert "admin" not in usernames

    # Попытка удалить admin (id=1)
    response_delete = await async_client.delete("/api/users/1", headers=_get_auth_headers())
    assert response_delete.status_code == 400
    assert response_delete.json()["detail"] == "Нельзя удалить встроенного администратора"
