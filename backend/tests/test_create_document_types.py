"""Integration tests for creating all document types."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _get_auth_headers():
    return {"Authorization": "Bearer admin"}


def test_create_order_type_success():
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

    response = client.post("/api/order-types", json=payload, headers=_get_auth_headers())

    # Could be 201 (created) or 409 (already exists from previous test run)
    assert response.status_code in (201, 409)

    if response.status_code == 201:
        data = response.json()
        assert data["code"] == "test_order_unique_12345"
        assert data["name"] == "Тестовый приказ уникальное название 12345"
        assert len(data["field_schema"]) == 2


def test_create_notification_type_success():
    """Should create a new notification type successfully."""
    payload = {
        "name": "Тестовое уведомление уникальное 67890",
        "code": "test_notification_unique_67890",
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }

    response = client.post("/api/notification-types", json=payload, headers=_get_auth_headers())

    assert response.status_code in (201, 409)

    if response.status_code == 201:
        data = response.json()
        assert data["code"] == "test_notification_unique_67890"


def test_create_statement_type_success():
    """Should create a new statement type successfully."""
    payload = {
        "name": "Тестовое заявление уникальное 11111",
        "code": "test_statement_unique_11111",
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }

    response = client.post("/api/statement-types", json=payload, headers=_get_auth_headers())

    assert response.status_code in (201, 409)

    if response.status_code == 201:
        data = response.json()
        assert data["code"] == "test_statement_unique_11111"


def test_list_all_statement_types():
    """Should list all existing statement types."""
    response = client.get("/api/statement-types", headers=_get_auth_headers())
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0

    # Print for debugging
    print(f"\nFound {len(data)} statement types:")
    for st in data:
        print(f"  - {st['code']}: {st['name']}")


def test_list_all_notification_types():
    """Should list all existing notification types."""
    response = client.get("/api/notification-types", headers=_get_auth_headers())
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0

    print(f"\nFound {len(data)} notification types:")
    for nt in data:
        print(f"  - {nt['code']}: {nt['name']}")


def test_list_all_order_types():
    """Should list all existing order types."""
    response = client.get("/api/order-types", headers=_get_auth_headers())
    assert response.status_code == 200

    data = response.json()
    assert "items" in data
    assert len(data["items"]) > 0

    print(f"\nFound {len(data['items'])} order types:")
    for ot in data["items"]:
        print(f"  - {ot['code']}: {ot['name']}")


def test_duplicate_order_type_returns_409():
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
    r1 = client.post("/api/order-types", json=payload, headers=_get_auth_headers())
    assert r1.status_code in (201, 409)

    # Try to create again - should be 409
    r2 = client.post("/api/order-types", json=payload, headers=_get_auth_headers())
    assert r2.status_code == 409


def test_duplicate_notification_type_returns_409():
    """Creating duplicate notification type should return 409."""
    payload = {
        "name": "Дубликат тест уведомление",
        "code": "duplicate_test_notification",
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }
    r1 = client.post("/api/notification-types", json=payload, headers=_get_auth_headers())
    assert r1.status_code in (201, 409)

    r2 = client.post("/api/notification-types", json=payload, headers=_get_auth_headers())
    assert r2.status_code == 409


def test_duplicate_statement_type_returns_409():
    """Creating duplicate statement type should return 409."""
    payload = {
        "name": "Дубликат тест заявление",
        "code": "duplicate_test_statement",
        "is_active": True,
        "field_schema": [],
        "filename_pattern": None,
    }
    r1 = client.post("/api/statement-types", json=payload, headers=_get_auth_headers())
    assert r1.status_code in (201, 409)

    r2 = client.post("/api/statement-types", json=payload, headers=_get_auth_headers())
    assert r2.status_code == 409
