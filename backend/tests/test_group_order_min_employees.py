"""Правило «групповой приказ требует минимум двух сотрудников» (#88).

Seam 1 — сервисный слой: каждый из четырёх входов создания группового приказа
(форма, черновик, коммит черновика, прямое обращение к API) блокирует создание
с одним сотрудником ошибкой 422; с двумя сотрудниками создание проходит.
Покрыты оба типа групповых приказов: отпуск за свой счёт и вызов в выходной.
"""

from datetime import date

import pytest

from app.core.exceptions import HRMSException
from app.api.deps import CurrentUser
from app.schemas.order import (
    VacationUnpaidGroupEmployeeCreate,
    VacationUnpaidGroupOrderCreate,
    WeekendCallGroupEmployeeCreate,
    WeekendCallGroupOrderCreate,
)
from app.services.order_draft_service import order_draft_service
from app.services.order_group_validation import GROUP_ORDER_MIN_EMPLOYEES_MESSAGE
from app.services.order_service import order_service

pytestmark = pytest.mark.asyncio(loop_scope="module")

GROUP_ORDER_TYPE_CODES = ("vacation_unpaid_group", "weekend_call_group")


# === Прямой вход: отпуск за свой счёт ===


async def test_vacation_unpaid_group_requires_two_employees(db_session, create_employee):
    await order_service.ensure_default_order_types(db_session)
    emp = await create_employee()

    payload = VacationUnpaidGroupOrderCreate(
        order_date=date(2026, 5, 10),
        order_number="42-Т",
        vacation_start=date(2026, 5, 15),
        employees=[VacationUnpaidGroupEmployeeCreate(employee_id=emp.id, vacation_days=5)],
    )

    with pytest.raises(HRMSException) as exc:
        await order_service.create_vacation_unpaid_group_order(db_session, payload)

    assert exc.value.status_code == 422
    assert exc.value.message == GROUP_ORDER_MIN_EMPLOYEES_MESSAGE


async def test_vacation_unpaid_group_with_two_employees_passes(db_session, create_employee):
    await order_service.ensure_default_order_types(db_session)
    emp1 = await create_employee()
    emp2 = await create_employee()

    payload = VacationUnpaidGroupOrderCreate(
        order_date=date(2026, 5, 10),
        order_number="42-Т",
        vacation_start=date(2026, 5, 15),
        employees=[
            VacationUnpaidGroupEmployeeCreate(employee_id=emp1.id, vacation_days=5),
            VacationUnpaidGroupEmployeeCreate(employee_id=emp2.id, vacation_days=3),
        ],
    )

    order = await order_service.create_vacation_unpaid_group_order(db_session, payload)

    assert order is not None
    assert order.is_group is True


# === Прямой вход: вызов в выходной ===


async def test_weekend_call_group_requires_two_employees(db_session, create_employee):
    await order_service.ensure_default_order_types(db_session)
    emp = await create_employee()

    payload = WeekendCallGroupOrderCreate(
        order_date=date(2026, 5, 10),
        order_number="43-В",
        mode="single",
        call_date=date(2026, 5, 17),
        employees=[WeekendCallGroupEmployeeCreate(employee_id=emp.id, vacation_days=1)],
    )

    with pytest.raises(HRMSException) as exc:
        await order_service.create_weekend_call_group_order(db_session, payload)

    assert exc.value.status_code == 422
    assert exc.value.message == GROUP_ORDER_MIN_EMPLOYEES_MESSAGE


async def test_weekend_call_group_with_two_employees_passes(db_session, create_employee):
    await order_service.ensure_default_order_types(db_session)
    emp1 = await create_employee()
    emp2 = await create_employee()

    payload = WeekendCallGroupOrderCreate(
        order_date=date(2026, 5, 10),
        order_number="43-В",
        mode="single",
        call_date=date(2026, 5, 17),
        employees=[
            WeekendCallGroupEmployeeCreate(employee_id=emp1.id, vacation_days=1),
            WeekendCallGroupEmployeeCreate(employee_id=emp2.id, vacation_days=1),
        ],
    )

    order = await order_service.create_weekend_call_group_order(db_session, payload)

    assert order is not None
    assert order.is_group is True


# === Черновик: создание ===


def _draft_payload(order_type_code: str, emp_ids: list[int], *, with_employee_objs: bool = False) -> dict:
    employees = []
    for idx, emp_id in enumerate(emp_ids):
        item: dict = {"employee_id": emp_id, "vacation_days": 5}
        if with_employee_objs:
            item["employee"] = {"id": emp_id, "name": f"Сотрудник {idx}"}
        employees.append(item)

    payload: dict = {
        "order_type_code": order_type_code,
        "order_date": date(2026, 5, 10),
        "order_number": "44-Ч",
        "employees": employees,
    }
    if order_type_code == "vacation_unpaid_group":
        payload["vacation_start"] = date(2026, 5, 15)
    else:
        payload["mode"] = "single"
        payload["call_date"] = date(2026, 5, 17)
    return payload


@pytest.fixture
def _tmp_drafts_dir(tmp_path, monkeypatch):
    """Направить каталог черновиков в tmp_path, как в остальных draft-тестах."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))
    order_draft_service._drafts_dir = tmp_path / ".drafts"
    order_draft_service.ensure_drafts_dir()
    return order_draft_service._drafts_dir


@pytest.mark.parametrize("order_type_code", GROUP_ORDER_TYPE_CODES)
async def test_create_group_draft_requires_two_employees(
    db_session, create_employee, order_type_code, _tmp_drafts_dir
):
    await order_service.ensure_default_order_types(db_session)
    order_type = await order_service.get_order_type_by_code(db_session, order_type_code)
    emp = await create_employee()

    payload = _draft_payload(order_type_code, [emp.id])

    with pytest.raises(HRMSException) as exc:
        await order_draft_service.create_group_draft(order_type_code, payload, order_type, "admin")

    assert exc.value.status_code == 422
    assert exc.value.message == GROUP_ORDER_MIN_EMPLOYEES_MESSAGE


@pytest.mark.parametrize("order_type_code", GROUP_ORDER_TYPE_CODES)
async def test_create_group_draft_with_two_employees_passes(
    db_session, create_employee, order_type_code, _tmp_drafts_dir
):
    await order_service.ensure_default_order_types(db_session)
    order_type = await order_service.get_order_type_by_code(db_session, order_type_code)
    emp1 = await create_employee()
    emp2 = await create_employee()

    payload = _draft_payload(order_type_code, [emp1.id, emp2.id], with_employee_objs=True)

    result = await order_draft_service.create_group_draft(order_type_code, payload, order_type, "admin")

    assert "draft_id" in result
    assert result["file_path"]


# === Черновик: коммит ===


@pytest.mark.parametrize("order_type_code", GROUP_ORDER_TYPE_CODES)
async def test_commit_group_draft_requires_two_employees(
    db_session, create_employee, order_type_code, _tmp_drafts_dir
):
    await order_service.ensure_default_order_types(db_session)
    emp = await create_employee()

    draft_id = "eeeeeeee-1111-2222-3333-444444444444"
    draft_path = _tmp_drafts_dir / f"{draft_id}_{order_type_code}.docx"
    draft_path.write_bytes(b"draft-bytes")
    metadata = {
        "draft_id": draft_id,
        "kind": "group_order",
        "order_type_code": order_type_code,
        "payload": _draft_payload(order_type_code, [emp.id]),
        "schema_version": 1,
    }
    order_draft_service.save_draft_metadata(draft_id, metadata)

    with pytest.raises(HRMSException) as exc:
        await order_service.create_group_order_from_draft(db_session, draft_id)

    assert exc.value.status_code == 422
    assert exc.value.message == GROUP_ORDER_MIN_EMPLOYEES_MESSAGE


@pytest.mark.parametrize("order_type_code", GROUP_ORDER_TYPE_CODES)
async def test_commit_group_draft_with_two_employees_passes(
    db_session, create_employee, order_type_code, _tmp_drafts_dir
):
    await order_service.ensure_default_order_types(db_session)
    emp1 = await create_employee()
    emp2 = await create_employee()

    draft_id = "ffffffff-1111-2222-3333-444444444444"
    draft_path = _tmp_drafts_dir / f"{draft_id}_{order_type_code}.docx"
    draft_path.write_bytes(b"draft-bytes")
    metadata = {
        "draft_id": draft_id,
        "kind": "group_order",
        "order_type_code": order_type_code,
        "payload": _draft_payload(order_type_code, [emp1.id, emp2.id]),
        "schema_version": 1,
    }
    order_draft_service.save_draft_metadata(draft_id, metadata)

    order = await order_service.create_group_order_from_draft(db_session, draft_id)

    assert order is not None
    assert order.is_group is True


async def test_commit_group_draft_failure_releases_commit_lock(
    db_session, create_employee, _tmp_drafts_dir, monkeypatch
):
    """#88 + #30 AC4: при заблокированном коммите (1 сотрудник) commit-lock
    снимается, чтобы черновик можно было довести до конца после добавления
    второго сотрудника."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    await order_service.ensure_default_order_types(db_session)
    emp = await create_employee()

    draft_id = "eeeeeeee-1111-2222-3333-444444444444"
    draft_path = _tmp_drafts_dir / f"{draft_id}_vacation_unpaid_group.docx"
    draft_path.write_bytes(b"draft-bytes")
    metadata = {
        "draft_id": draft_id,
        "kind": "group_order",
        "order_type_code": "vacation_unpaid_group",
        "payload": _draft_payload("vacation_unpaid_group", [emp.id]),
        "schema_version": 1,
    }
    order_draft_service.save_draft_metadata(draft_id, metadata)

    from app.api.onlyoffice import commit_group_order_draft

    with pytest.raises(HRMSException) as exc:
        await commit_group_order_draft(
            draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin")
        )

    assert exc.value.status_code == 422
    lock_path = _tmp_drafts_dir / f"{draft_id}.commit.lock"
    assert not lock_path.exists(), "commit lock must be released after failed group commit"

