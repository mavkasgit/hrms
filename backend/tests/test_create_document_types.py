"""Integration tests for creating all document types."""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest.fixture(scope="module")
async def async_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


def _get_auth_headers():
    return {"Authorization": "Bearer admin"}


async def test_create_order_type_success(async_client):
    """Should create a new order type successfully."""
    payload = {
        "name": "Тестовый приказ уникальное название 12345",
        "code": "test_order_unique_12345",
        "is_active": True,
        "show_in_orders_page": True,
        "letter": "к",
        "field_schema": [
            {"key": "test_date", "label": "Test date", "type": "date", "required": False},
            {"key": "test_field", "label": "Test field", "type": "text", "required": False},
        ],
        "filename_pattern": None,
    }

    response = await async_client.post("/api/order-types", json=payload, headers=_get_auth_headers())

    # Could be 201 (created) or 409 (already exists from previous test run)
    assert response.status_code in (201, 409)

    if response.status_code == 201:
        data = response.json()
        assert data["code"] == "test_order_unique_12345"
        assert data["name"] == "Тестовый приказ уникальное название 12345"
        assert len(data["field_schema"]) == 2


async def test_create_notification_type_success(async_client):
    """Should create a new notification type successfully."""
    payload = {
        "name": "Тестовое уведомление уникальное 67890",
        "code": "test_notification_unique_67890",
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }

    response = await async_client.post("/api/notification-types", json=payload, headers=_get_auth_headers())

    assert response.status_code in (201, 409)

    if response.status_code == 201:
        data = response.json()
        assert data["code"] == "test_notification_unique_67890"


async def test_create_statement_type_success(async_client):
    """Should create a new statement type successfully."""
    payload = {
        "name": "Тестовое заявление уникальное 11111",
        "code": "test_statement_unique_11111",
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }

    response = await async_client.post("/api/statement-types", json=payload, headers=_get_auth_headers())

    assert response.status_code in (201, 409)

    if response.status_code == 201:
        data = response.json()
        assert data["code"] == "test_statement_unique_11111"


async def test_list_all_statement_types(async_client):
    """Should list all existing statement types."""
    response = await async_client.get("/api/statement-types", headers=_get_auth_headers())
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


async def test_list_all_notification_types(async_client):
    """Should list all existing notification types."""
    response = await async_client.get("/api/notification-types", headers=_get_auth_headers())
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


async def test_list_all_order_types(async_client):
    """Should list all existing order types."""
    response = await async_client.get("/api/order-types", headers=_get_auth_headers())
    assert response.status_code == 200

    data = response.json()
    assert "items" in data
    assert len(data["items"]) > 0


async def test_duplicate_order_type_returns_409(async_client):
    """Creating duplicate order type should return 409."""
    # First create
    payload = {
        "name": "Дубликат тест приказ",
        "code": "duplicate_test_order",
        "is_active": True,
        "show_in_orders_page": True,
        "letter": "к",
        "field_schema": [],
        "filename_pattern": None,
    }
    r1 = await async_client.post("/api/order-types", json=payload, headers=_get_auth_headers())
    assert r1.status_code in (201, 409)

    # Try to create again - should be 409
    r2 = await async_client.post("/api/order-types", json=payload, headers=_get_auth_headers())
    assert r2.status_code == 409


async def test_duplicate_notification_type_returns_409(async_client):
    """Creating duplicate notification type should return 409."""
    payload = {
        "name": "Дубликат тест уведомление",
        "code": "duplicate_test_notification",
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }
    r1 = await async_client.post("/api/notification-types", json=payload, headers=_get_auth_headers())
    assert r1.status_code in (201, 409)

    r2 = await async_client.post("/api/notification-types", json=payload, headers=_get_auth_headers())
    assert r2.status_code == 409


async def test_duplicate_statement_type_returns_409(async_client):
    """Creating duplicate statement type should return 409."""
    payload = {
        "name": "Дубликат тест заявление",
        "code": "duplicate_test_statement",
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }
    r1 = await async_client.post("/api/statement-types", json=payload, headers=_get_auth_headers())
    assert r1.status_code in (201, 409)

    r2 = await async_client.post("/api/statement-types", json=payload, headers=_get_auth_headers())
    assert r2.status_code == 409
