"""Application service создания черновиков приказов (ADR-0008, #97).

Подготовка создания черновика живёт в `OrderDraftApplicationService`, а не в
HTTP-роутере: загрузка employee, валидация активного order_type, генерация
номера, нормализация vacation/transfer полей и сборка group payload. Роутер
конструирует `Create*DraftCommand` и делегирует сервису.
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import Any, cast

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import EmployeeNotFoundError, HRMSException
from app.schemas.order import GroupOrderCreate, OrderCreate
from app.services import order_draft_application_service as app_svc_module
from app.services.order_draft_application_service import (
    CreateGroupOrderDraftCommand,
    CreateOrderDraftCommand,
    order_draft_application_service,
)


def _db() -> AsyncSession:
    return cast(AsyncSession, object())


def _stub_order_type(code: str = "general_order", is_active: bool = True) -> SimpleNamespace:
    return SimpleNamespace(code=code, is_active=is_active)


def _patch_order_service(monkeypatch, *, get_employee_by_id, get_order_type_by_id, get_next_number):
    """Ставит поддельный `order_service`; create_draft записывает вызов."""
    captured: dict[str, Any] = {}

    async def fake_ensure(db):
        return []

    async def fake_create_draft(data, employee, order_type, user_id="system"):
        captured.update(data=data, employee=employee, order_type=order_type, user_id=user_id)
        return {"draft_id": "d1", "file_path": "/x"}

    monkeypatch.setattr(app_svc_module, "order_service", SimpleNamespace(
        ensure_default_order_types=fake_ensure,
        get_employee_by_id=get_employee_by_id,
        get_order_type_by_id=get_order_type_by_id,
        get_next_number=get_next_number,
    ))
    monkeypatch.setattr(app_svc_module, "order_draft_service", SimpleNamespace(create_draft=fake_create_draft))
    return captured


async def test_create_draft_generates_number_when_missing(monkeypatch):
    employee = SimpleNamespace(name="Иванов")

    async def fake_get_employee(db, employee_id):
        return employee

    async def fake_get_order_type(db, order_type_id):
        return _stub_order_type()

    async def fake_get_next_number(db, order_type_id):
        return "42-К"

    captured = _patch_order_service(
        monkeypatch,
        get_employee_by_id=fake_get_employee,
        get_order_type_by_id=fake_get_order_type,
        get_next_number=fake_get_next_number,
    )

    data = OrderCreate(employee_id=1, order_type_id=5, order_date=date(2026, 8, 1), order_number=None)
    result = await order_draft_application_service.create_draft(
        _db(), CreateOrderDraftCommand(data=data, user_id="admin")
    )

    assert result == {"draft_id": "d1", "file_path": "/x"}
    assert captured["data"].order_number == "42-К"
    assert captured["employee"] is employee
    assert captured["order_type"].code == "general_order"
    assert captured["user_id"] == "admin"


async def test_create_draft_keeps_provided_number(monkeypatch):
    calls: list[int] = []

    async def fake_get_employee(db, employee_id):
        return None

    async def fake_get_order_type(db, order_type_id):
        return _stub_order_type()

    async def fake_get_next_number(db, order_type_id):
        calls.append(order_type_id)
        return "99-К"

    captured = _patch_order_service(
        monkeypatch,
        get_employee_by_id=fake_get_employee,
        get_order_type_by_id=fake_get_order_type,
        get_next_number=fake_get_next_number,
    )

    data = OrderCreate(employee_id=None, order_type_id=5, order_date=date(2026, 8, 1), order_number="77-К")
    await order_draft_application_service.create_draft(_db(), CreateOrderDraftCommand(data=data))

    assert calls == []
    assert captured["data"].order_number == "77-К"


async def test_create_draft_employee_not_found_raises(monkeypatch):
    async def fake_get_employee(db, employee_id):
        return None

    async def fake_get_order_type(db, order_type_id):
        return _stub_order_type()

    async def fake_get_next_number(db, order_type_id):
        return "1"

    _patch_order_service(
        monkeypatch,
        get_employee_by_id=fake_get_employee,
        get_order_type_by_id=fake_get_order_type,
        get_next_number=fake_get_next_number,
    )

    data = OrderCreate(employee_id=42, order_type_id=5, order_date=date(2026, 8, 1))
    with pytest.raises(EmployeeNotFoundError):
        await order_draft_application_service.create_draft(_db(), CreateOrderDraftCommand(data=data))


async def test_create_draft_rejects_inactive_order_type(monkeypatch):
    async def fake_get_employee(db, employee_id):
        return None

    async def fake_get_order_type(db, order_type_id):
        return _stub_order_type(is_active=False)

    async def fake_get_next_number(db, order_type_id):
        return "1"

    _patch_order_service(
        monkeypatch,
        get_employee_by_id=fake_get_employee,
        get_order_type_by_id=fake_get_order_type,
        get_next_number=fake_get_next_number,
    )

    data = OrderCreate(employee_id=None, order_type_id=5, order_date=date(2026, 8, 1))
    with pytest.raises(HRMSException) as exc:
        await order_draft_application_service.create_draft(_db(), CreateOrderDraftCommand(data=data))

    assert exc.value.status_code == 404
    assert exc.value.error_code == "order_type_not_found"


async def test_create_draft_employee_without_employee_id_ok(monkeypatch):
    async def fake_get_employee(db, employee_id):
        return SimpleNamespace(name="Иванов")

    async def fake_get_order_type(db, order_type_id):
        return _stub_order_type(code="general_order")

    async def fake_get_next_number(db, order_type_id):
        return "5"

    captured = _patch_order_service(
        monkeypatch,
        get_employee_by_id=fake_get_employee,
        get_order_type_by_id=fake_get_order_type,
        get_next_number=fake_get_next_number,
    )

    data = OrderCreate(employee_id=None, order_type_id=5, order_date=date(2026, 8, 1))
    await order_draft_application_service.create_draft(_db(), CreateOrderDraftCommand(data=data))

    assert captured["employee"] is None


async def test_create_draft_normalizes_vacation_days(monkeypatch):
    async def fake_get_employee(db, employee_id):
        return None

    async def fake_get_order_type(db, order_type_id):
        return _stub_order_type(code="vacation_paid")

    async def fake_get_next_number(db, order_type_id):
        return "1"

    captured = _patch_order_service(
        monkeypatch,
        get_employee_by_id=fake_get_employee,
        get_order_type_by_id=fake_get_order_type,
        get_next_number=fake_get_next_number,
    )

    holidays_by_year: list[int] = []

    async def fake_get_holidays(db, year):
        holidays_by_year.append(year)
        return []

    monkeypatch.setattr(app_svc_module, "references_repository", SimpleNamespace(get_holidays_for_year=fake_get_holidays))
    monkeypatch.setattr(app_svc_module, "calculate_vacation_days", lambda start, end, holidays_count: 17)

    data = OrderCreate(
        employee_id=None,
        order_type_id=5,
        order_date=date(2026, 8, 1),
        extra_fields={"vacation_start": "2026-08-10", "vacation_end": "2026-08-20"},
    )
    await order_draft_application_service.create_draft(_db(), CreateOrderDraftCommand(data=data))

    assert captured["data"].extra_fields["vacation_days"] == 17
    assert holidays_by_year == [2026]


async def test_create_draft_skips_vacation_normalization_without_period(monkeypatch):
    async def fake_get_employee(db, employee_id):
        return None

    async def fake_get_order_type(db, order_type_id):
        return _stub_order_type(code="vacation_paid")

    async def fake_get_next_number(db, order_type_id):
        return "1"

    captured = _patch_order_service(
        monkeypatch,
        get_employee_by_id=fake_get_employee,
        get_order_type_by_id=fake_get_order_type,
        get_next_number=fake_get_next_number,
    )

    data = OrderCreate(
        employee_id=None,
        order_type_id=5,
        order_date=date(2026, 8, 1),
        extra_fields={"reason": "семейные обстоятельства"},
    )
    await order_draft_application_service.create_draft(_db(), CreateOrderDraftCommand(data=data))

    assert captured["data"].extra_fields == {"reason": "семейные обстоятельства"}


async def test_create_draft_normalizes_transfer_position_name(monkeypatch):
    async def fake_get_employee(db, employee_id):
        return None

    async def fake_get_order_type(db, order_type_id):
        return _stub_order_type(code="transfer")

    async def fake_get_next_number(db, order_type_id):
        return "1"

    captured = _patch_order_service(
        monkeypatch,
        get_employee_by_id=fake_get_employee,
        get_order_type_by_id=fake_get_order_type,
        get_next_number=fake_get_next_number,
    )

    position = SimpleNamespace(name="Инженер")

    class _FakeResult:
        def scalar_one_or_none(self):
            return position

    class _FakeDB:
        async def execute(self, stmt):
            return _FakeResult()

    data = OrderCreate(
        employee_id=None,
        order_type_id=5,
        order_date=date(2026, 8, 1),
        extra_fields={"new_position": 12},
    )
    await order_draft_application_service.create_draft(
        cast(AsyncSession, _FakeDB()), CreateOrderDraftCommand(data=data)
    )

    assert captured["data"].extra_fields["new_position_name"] == "Инженер"


async def test_create_draft_keeps_extra_fields_for_other_types(monkeypatch):
    async def fake_get_employee(db, employee_id):
        return None

    async def fake_get_order_type(db, order_type_id):
        return _stub_order_type(code="dismissal")

    async def fake_get_next_number(db, order_type_id):
        return "1"

    captured = _patch_order_service(
        monkeypatch,
        get_employee_by_id=fake_get_employee,
        get_order_type_by_id=fake_get_order_type,
        get_next_number=fake_get_next_number,
    )

    data = OrderCreate(
        employee_id=None,
        order_type_id=5,
        order_date=date(2026, 8, 1),
        extra_fields={"reason": "по собственному желанию"},
    )
    await order_draft_application_service.create_draft(_db(), CreateOrderDraftCommand(data=data))

    assert captured["data"].extra_fields == {"reason": "по собственному желанию"}


# ── Групповые черновики ──────────────────────────────────────────────────────


async def test_create_group_draft_collects_employee_objects(monkeypatch):
    emp1 = SimpleNamespace(name="Иванов")
    emp2 = SimpleNamespace(name="Петров")
    by_id = {1: emp1, 2: emp2}
    captured: dict[str, Any] = {}

    async def fake_ensure(db):
        return []

    async def fake_get_order_type_by_code(db, code):
        return _stub_order_type(code="vacation_unpaid_group")

    async def fake_get_employee(db, employee_id):
        return by_id.get(employee_id)

    async def fake_create_group_draft(order_type_code, payload, order_type, user_id="system"):
        captured.update(payload=payload, order_type=order_type, user_id=user_id)
        return {"draft_id": "g1", "file_path": "/x"}

    monkeypatch.setattr(app_svc_module, "order_service", SimpleNamespace(
        ensure_default_order_types=fake_ensure,
        get_order_type_by_code=fake_get_order_type_by_code,
        get_employee_by_id=fake_get_employee,
    ))
    monkeypatch.setattr(app_svc_module, "order_draft_service", SimpleNamespace(create_group_draft=fake_create_group_draft))

    data = GroupOrderCreate(
        order_type_code="vacation_unpaid_group",
        order_date=date(2026, 8, 1),
        employees=[{"employee_id": 1, "vacation_days": 5}, {"employee_id": 2, "vacation_days": 7}],
        vacation_start=date(2026, 9, 1),
    )
    result = await order_draft_application_service.create_group_draft(
        _db(), CreateGroupOrderDraftCommand(data=data, user_id="admin")
    )

    assert result == {"draft_id": "g1", "file_path": "/x"}
    assert captured["order_type"].code == "vacation_unpaid_group"
    assert captured["user_id"] == "admin"
    payload = captured["payload"]
    assert payload["order_type_code"] == "vacation_unpaid_group"
    assert payload["employees"][0]["employee"] is emp1
    assert payload["employees"][1]["employee"] is emp2
    assert payload["vacation_start"] == date(2026, 9, 1)


async def test_create_group_draft_employee_not_found_raises(monkeypatch):
    async def fake_ensure(db):
        return []

    async def fake_get_order_type_by_code(db, code):
        return _stub_order_type(code="vacation_unpaid_group")

    async def fake_get_employee(db, employee_id):
        return None

    monkeypatch.setattr(app_svc_module, "order_service", SimpleNamespace(
        ensure_default_order_types=fake_ensure,
        get_order_type_by_code=fake_get_order_type_by_code,
        get_employee_by_id=fake_get_employee,
    ))

    data = GroupOrderCreate(
        order_type_code="vacation_unpaid_group",
        order_date=date(2026, 8, 1),
        employees=[{"employee_id": 42, "vacation_days": 5}],
    )
    with pytest.raises(EmployeeNotFoundError):
        await order_draft_application_service.create_group_draft(_db(), CreateGroupOrderDraftCommand(data=data))


async def test_create_group_draft_rejects_inactive_order_type(monkeypatch):
    async def fake_ensure(db):
        return []

    async def fake_get_order_type_by_code(db, code):
        return _stub_order_type(code="vacation_unpaid_group", is_active=False)

    async def fake_get_employee(db, employee_id):
        return SimpleNamespace(name="Иванов")

    monkeypatch.setattr(app_svc_module, "order_service", SimpleNamespace(
        ensure_default_order_types=fake_ensure,
        get_order_type_by_code=fake_get_order_type_by_code,
        get_employee_by_id=fake_get_employee,
    ))

    data = GroupOrderCreate(
        order_type_code="vacation_unpaid_group",
        order_date=date(2026, 8, 1),
        employees=[{"employee_id": 1, "vacation_days": 5}],
    )
    with pytest.raises(HRMSException) as exc:
        await order_draft_application_service.create_group_draft(_db(), CreateGroupOrderDraftCommand(data=data))

    assert exc.value.status_code == 404
    assert exc.value.error_code == "order_type_not_found"


# ── Тонкие роутеры: только конструкция команды + вызов сервиса ──────────────


async def test_create_order_draft_router_delegates_to_application_service(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    captured: dict[str, Any] = {}

    async def fake_create(db, command):
        captured["command"] = command
        return {"draft_id": "d1", "file_path": "/x"}

    monkeypatch.setattr(oo_api.order_draft_application_service, "create_draft", fake_create)

    data = OrderCreate(employee_id=1, order_type_id=2, order_date=date(2026, 8, 1))
    result = await oo_api.create_order_draft(data=data, db=_db(), current_user="admin")

    assert result == {"draft_id": "d1", "file_path": "/x"}
    assert isinstance(captured["command"], CreateOrderDraftCommand)
    assert captured["command"].data is data
    assert captured["command"].user_id == "admin"


async def test_create_order_group_draft_router_delegates_and_builds_edit_url(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    captured: dict[str, Any] = {}

    async def fake_create_group(db, command):
        captured["command"] = command
        return {"draft_id": "g1", "file_path": "/x"}

    monkeypatch.setattr(oo_api.order_draft_application_service, "create_group_draft", fake_create_group)

    data = GroupOrderCreate(
        order_type_code="vacation_unpaid_group",
        order_date=date(2026, 8, 1),
        employees=[{"employee_id": 1, "vacation_days": 3}],
    )
    result = await oo_api.create_order_group_draft(data=data, db=_db(), current_user="admin")

    assert result == {"draft_id": "g1", "edit_url": "/drafts/g1/edit-docx"}
    assert isinstance(captured["command"], CreateGroupOrderDraftCommand)
    assert captured["command"].data is data
    assert captured["command"].user_id == "admin"
