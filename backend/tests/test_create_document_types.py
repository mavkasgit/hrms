"""Integration tests for creating all document types."""
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.main import app

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest.fixture
async def async_client(db_session: AsyncSession):
    """ASGI client bound to isolated test db_session (not app .env.dev DATABASE_URL)."""

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


def _unique(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


async def test_create_order_type_success(async_client):
    """Should create a new order type successfully."""
    code = _unique("test_order")
    payload = {
        "name": f"Тестовый приказ {code}",
        "code": code,
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
    assert response.status_code == 201
    data = response.json()
    assert data["code"] == code
    assert data["name"] == payload["name"]
    assert len(data["field_schema"]) == 2


async def test_create_notification_type_success(async_client):
    """Should create a new notification type successfully."""
    code = _unique("test_notification")
    payload = {
        "name": f"Тестовое уведомление {code}",
        "code": code,
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }

    response = await async_client.post("/api/notification-types", json=payload, headers=_get_auth_headers())
    assert response.status_code == 201
    data = response.json()
    assert data["code"] == code


async def test_create_statement_type_success(async_client):
    """Should create a new statement type successfully."""
    code = _unique("test_statement")
    payload = {
        "name": f"Тестовое заявление {code}",
        "code": code,
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }

    response = await async_client.post("/api/statement-types", json=payload, headers=_get_auth_headers())
    assert response.status_code == 201
    data = response.json()
    assert data["code"] == code


async def test_list_all_statement_types(async_client):
    """Should list all existing statement types."""
    code = _unique("list_statement")
    await async_client.post(
        "/api/statement-types",
        json={
            "name": f"List statement {code}",
            "code": code,
            "is_active": True,
            "field_schema": [],
            "filename_pattern": None,
        },
        headers=_get_auth_headers(),
    )

    response = await async_client.get("/api/statement-types", headers=_get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


async def test_list_all_notification_types(async_client):
    """Should list all existing notification types."""
    code = _unique("list_notification")
    await async_client.post(
        "/api/notification-types",
        json={
            "name": f"List notification {code}",
            "code": code,
            "is_active": True,
            "field_schema": [],
            "filename_pattern": None,
        },
        headers=_get_auth_headers(),
    )

    response = await async_client.get("/api/notification-types", headers=_get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


async def test_list_all_order_types(async_client):
    """Should list all existing order types."""
    code = _unique("list_order")
    await async_client.post(
        "/api/order-types",
        json={
            "name": f"List order {code}",
            "code": code,
            "is_active": True,
            "show_in_orders_page": True,
            "letter": "к",
            "field_schema": [],
            "filename_pattern": None,
        },
        headers=_get_auth_headers(),
    )

    response = await async_client.get("/api/order-types", headers=_get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) > 0


async def test_duplicate_order_type_returns_409(async_client):
    """Creating duplicate order type should return 409."""
    code = _unique("duplicate_order")
    payload = {
        "name": f"Дубликат {code}",
        "code": code,
        "is_active": True,
        "show_in_orders_page": True,
        "letter": "к",
        "field_schema": [],
        "filename_pattern": None,
    }
    r1 = await async_client.post("/api/order-types", json=payload, headers=_get_auth_headers())
    assert r1.status_code == 201

    r2 = await async_client.post("/api/order-types", json=payload, headers=_get_auth_headers())
    assert r2.status_code == 409


async def test_duplicate_notification_type_returns_409(async_client):
    """Creating duplicate notification type should return 409."""
    code = _unique("duplicate_notification")
    payload = {
        "name": f"Дубликат {code}",
        "code": code,
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }
    r1 = await async_client.post("/api/notification-types", json=payload, headers=_get_auth_headers())
    assert r1.status_code == 201

    r2 = await async_client.post("/api/notification-types", json=payload, headers=_get_auth_headers())
    assert r2.status_code == 409


async def test_duplicate_statement_type_returns_409(async_client):
    """Creating duplicate statement type should return 409."""
    code = _unique("duplicate_statement")
    payload = {
        "name": f"Дубликат {code}",
        "code": code,
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }
    r1 = await async_client.post("/api/statement-types", json=payload, headers=_get_auth_headers())
    assert r1.status_code == 201

    r2 = await async_client.post("/api/statement-types", json=payload, headers=_get_auth_headers())
    assert r2.status_code == 409
