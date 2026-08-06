"""Tests for the unified draft list (#58) and read-only draft config (#59).

Covers:
- list_all_drafts combining orders/notifications/statements in one unified shape
- group order title («Групповой приказ — N сотрудников»)
- sorting by created_at (newest first, missing date last)
- view_url / edit_url / list_url for each kind
- draft OnlyOffice config with mode=view (read-only) and default mode=edit
"""

from __future__ import annotations

import inspect
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.config import settings
from app.models.notification import Notification
from app.models.statement import Statement

pytestmark = pytest.mark.asyncio(loop_scope="module")

DRAFT_ID = "33333333-3333-3333-3333-333333333333"


@pytest.fixture(autouse=True)
def _enable_onlyoffice(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")


# ── GET /drafts unified list (#58) ───────────────────────────────────────────


async def test_list_all_drafts_combines_kinds_and_sorted(db_session, monkeypatch):
    from app.api import onlyoffice as oo_api

    meta = {
        "draft_id": DRAFT_ID,
        "kind": "single_order",
        "order_type_code": "transfer",
        "payload": {
            "employee_id": 100,
            "order_date": "2026-01-01",
            "order_number": "77",
        },
        "created_by": "admin",
        "created_at": "2026-08-05T10:00:00+00:00",
        "save_status": {
            "state": "saved",
            "last_saved_at": "2026-08-05T11:00:00+00:00",
            "last_error": None,
            "last_error_at": None,
        },
    }
    monkeypatch.setattr(oo_api.order_draft_service, "list_drafts", lambda: [meta])
    monkeypatch.setattr(
        oo_api.order_service,
        "get_employee_by_id",
        AsyncMock(return_value=SimpleNamespace(name="Иван Петров")),
    )
    monkeypatch.setattr(
        oo_api.order_service,
        "get_order_type_by_code",
        AsyncMock(return_value=SimpleNamespace(name="Перевод")),
    )

    notification = Notification(
        title="Уведомление о переводе",
        number="5",
        date=date(2026, 1, 2),
        is_draft=True,
        created_at=datetime(2026, 8, 6, 9, 0, 0),
    )
    db_session.add(notification)
    statement = Statement(
        title="Заявление на отпуск",
        number="3",
        date=date(2026, 1, 3),
        is_draft=True,
        created_at=datetime(2026, 8, 4, 9, 0, 0),
    )
    db_session.add(statement)
    await db_session.flush()

    items = await oo_api.list_all_drafts(db=db_session, current_user="admin")

    # Новые сверху: notification (06.08) → order (05.08) → statement (04.08)
    assert [item.kind for item in items] == ["notification", "order", "statement"]

    by_kind = {item.kind: item for item in items}

    order = by_kind["order"]
    assert order.draft_id == DRAFT_ID
    assert order.title == "Иван Петров"
    assert order.type_name == "Перевод"
    assert order.number == "77"
    assert order.date == "2026-01-01"
    assert order.save_status is not None
    assert order.save_status["state"] == "saved"
    assert order.view_url == f"/orders/drafts/{DRAFT_ID}/view-docx"
    assert order.edit_url == f"/orders/drafts/{DRAFT_ID}/edit-docx"
    assert order.list_url == "/orders/drafts"

    notif = by_kind["notification"]
    assert notif.draft_id == f"notification:{notification.id}"
    assert notif.title == "Уведомление о переводе"
    assert notif.type_name is None
    assert notif.number == "5"
    assert notif.date == "2026-01-02"
    assert notif.save_status is None
    assert notif.view_url == f"/notifications/{notification.id}/view-docx"
    assert notif.edit_url == f"/notifications/{notification.id}/edit-docx"
    assert notif.list_url == "/orders/notifications"

    stmt = by_kind["statement"]
    assert stmt.draft_id == f"statement:{statement.id}"
    assert stmt.title == "Заявление на отпуск"
    assert stmt.number == "3"
    assert stmt.save_status is None
    assert stmt.view_url == f"/statements/{statement.id}/view-docx"
    assert stmt.edit_url == f"/statements/{statement.id}/edit-docx"
    assert stmt.list_url == "/orders/statements"


async def test_list_all_drafts_notification_title_from_employee(db_session, monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(oo_api.order_draft_service, "list_drafts", lambda: [])

    db_session.add(Notification(
        title="Название документа",
        number="1",
        date=date(2026, 1, 2),
        is_draft=True,
        created_at=datetime(2026, 8, 6, 9, 0, 0),
    ))
    await db_session.flush()

    items = await oo_api.list_all_drafts(db=db_session, current_user="admin")
    assert items[0].title == "Название документа"


async def test_list_all_drafts_notification_title_with_employee(db_session, monkeypatch, create_employee):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(oo_api.order_draft_service, "list_drafts", lambda: [])
    employee = await create_employee(name="Мария Смирнова")

    db_session.add(Notification(
        title="Уведомление о переводе",
        number="7",
        date=date(2026, 1, 2),
        employee_id=employee.id,
        is_draft=True,
        created_at=datetime(2026, 8, 6, 9, 0, 0),
    ))
    await db_session.flush()

    items = await oo_api.list_all_drafts(db=db_session, current_user="admin")
    # Название документа + ФИО сотрудника (#58).
    assert items[0].title == "Уведомление о переводе — Мария Смирнова"


async def test_list_all_drafts_group_order_title(db_session, monkeypatch):
    from app.api import onlyoffice as oo_api

    meta = {
        "draft_id": DRAFT_ID,
        "kind": "group_order",
        "order_type_code": "vacation_unpaid_group",
        "payload": {
            "order_date": "2026-01-01",
            "employees": [
                {"employee_id": 1},
                {"employee_id": 2},
                {"employee_id": 3},
            ],
        },
        "created_at": "2026-08-05T10:00:00+00:00",
    }
    monkeypatch.setattr(oo_api.order_draft_service, "list_drafts", lambda: [meta])
    monkeypatch.setattr(
        oo_api.order_service,
        "get_order_type_by_code",
        AsyncMock(return_value=SimpleNamespace(name="Отпуск без содержания (групп.)")),
    )

    items = await oo_api.list_all_drafts(db=db_session, current_user="admin")
    assert len(items) == 1
    assert items[0].kind == "order"
    assert items[0].title == "Групповой приказ — 3 сотрудников"
    assert items[0].type_name == "Отпуск без содержания (групп.)"


async def test_list_all_drafts_defaults_never_for_missing_save_status(db_session, monkeypatch):
    from app.api import onlyoffice as oo_api

    meta = {
        "draft_id": DRAFT_ID,
        "kind": "single_order",
        "order_type_code": None,
        "payload": {"order_date": "2026-01-01", "order_number": "1", "employee_id": None},
        "created_at": "2026-08-05T10:00:00+00:00",
    }
    monkeypatch.setattr(oo_api.order_draft_service, "list_drafts", lambda: [meta])

    items = await oo_api.list_all_drafts(db=db_session, current_user="admin")
    assert items[0].save_status is not None
    assert items[0].save_status["state"] == "never"
    assert items[0].title is None


# ── draft config mode (#59) ──────────────────────────────────────────────────


async def test_draft_config_mode_default_is_edit():
    from app.api import onlyoffice as oo_api

    sig = inspect.signature(oo_api.draft_onlyoffice_config)
    mode_param = sig.parameters["mode"]
    # Query("edit") — FastAPI применяет этот default, когда параметр не передан.
    assert getattr(mode_param.default, "default", None) == "edit"


async def test_draft_config_view_mode_read_only(monkeypatch, tmp_path):
    from app.api import onlyoffice as oo_api

    draft_path = tmp_path / f"{DRAFT_ID}_draft.docx"
    draft_path.write_bytes(b"x")
    monkeypatch.setattr(oo_api.order_draft_service, "get_draft_path", lambda draft_id: draft_path)

    config = await oo_api.draft_onlyoffice_config(
        draft_id=DRAFT_ID,
        request=MagicMock(),
        mode="view",
        current_user="admin",
    )
    assert config["editorConfig"]["mode"] == "view"
    assert config["document"]["permissions"]["edit"] is False
    assert config["editorConfig"]["customization"]["autosave"] is False
    assert config["editorConfig"]["customization"]["forcesave"] is False


async def test_draft_config_edit_mode_has_edit_rights(monkeypatch, tmp_path):
    from app.api import onlyoffice as oo_api

    draft_path = tmp_path / f"{DRAFT_ID}_draft.docx"
    draft_path.write_bytes(b"x")
    monkeypatch.setattr(oo_api.order_draft_service, "get_draft_path", lambda draft_id: draft_path)

    config = await oo_api.draft_onlyoffice_config(
        draft_id=DRAFT_ID,
        request=MagicMock(),
        mode="edit",
        current_user="admin",
    )
    assert config["editorConfig"]["mode"] == "edit"
    assert config["document"]["permissions"]["edit"] is True
    assert config["editorConfig"]["customization"]["autosave"] is True
    assert config["editorConfig"]["customization"]["forcesave"] is True
