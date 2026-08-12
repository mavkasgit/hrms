from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.models.order import Order
from app.models.vacation import Vacation
from app.models.vacation_adjustment import VacationAdjustment
from app.services.order_draft_service import order_draft_service
from app.services.order_service import order_service
from app.services.vacation_service import vacation_service


pytestmark = pytest.mark.asyncio(loop_scope="module")


def _write_draft(
    *,
    draft_id: str,
    order_type_id: int,
    employee_id: int,
    order_type_code: str,
    extra_fields: dict,
    order_number: str = "R-101",
    order_date: str = "2026-04-04",
) -> None:
    """Файловый черновик приказа: docx + метаданные (контракт #30)."""
    draft_path = order_draft_service._drafts_dir / f"{draft_id}_order.docx"
    draft_path.write_bytes(b"draft-content")
    metadata = {
        "draft_id": draft_id,
        "kind": "single_order",
        "order_type_code": order_type_code,
        "payload": {
            "employee_id": employee_id,
            "order_type_id": order_type_id,
            "order_date": order_date,
            "order_number": order_number,
            "notes": None,
            "extra_fields": extra_fields,
        },
        "created_by": "admin",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "draft",
        "schema_version": 1,
    }
    order_draft_service.save_draft_metadata(draft_id, metadata)


def _prepare_drafts_dir(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))
    order_draft_service._drafts_dir = tmp_path / ".drafts"
    order_draft_service.ensure_drafts_dir()


async def _count_orders_by_source_draft(db_session, draft_id: str) -> int:
    result = await db_session.execute(
        select(func.count()).select_from(Order).where(Order.source_draft_id == draft_id)
    )
    return result.scalar_one()


async def test_recall_reuses_editor_committed_order(db_session, create_employee, monkeypatch, tmp_path):
    """#109: после self-commit редактора (#31) recall_vacation переиспользует приказ.

    Редактор коммитит черновик (приказ + удаление файлов черновика), затем
    родительская страница вызывает recall_vacation с тем же draft_id. Второй
    приказ создаваться НЕ должен; корректировка применяется к существующему.
    """
    _prepare_drafts_dir(monkeypatch, tmp_path)

    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await vacation_service.create_vacation(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 4, 1),
            "end_date": date(2026, 4, 11),
            "vacation_type": "Трудовой",
        },
        "admin",
    )
    vacation_id = created["id"]

    recall_type = await order_service.get_order_type_by_code(db_session, "vacation_recall")
    draft_id = str(uuid4())
    _write_draft(
        draft_id=draft_id,
        order_type_id=recall_type.id,
        employee_id=employee.id,
        order_type_code="vacation_recall",
        extra_fields={"recall_date": "2026-04-05"},
        order_number="R-101",
    )

    committed = await order_service.create_single_order_from_draft(db_session, draft_id)
    assert await _count_orders_by_source_draft(db_session, draft_id) == 1

    result = await vacation_service.recall_vacation(
        db_session,
        vacation_id,
        {
            "recall_date": date(2026, 4, 5),
            "order_date": date(2026, 4, 4),
            "order_number": "R-101",
            "draft_id": draft_id,
        },
        "admin",
    )

    assert await _count_orders_by_source_draft(db_session, draft_id) == 1, "не создаём второй приказ"
    assert result["recall_order_id"] == committed.id
    assert result["recall_order_number"] == committed.order_number

    vacation = (
        await db_session.execute(select(Vacation).where(Vacation.id == vacation_id))
    ).scalar_one()
    assert vacation.is_recalled is True
    assert vacation.recall_order_id == committed.id

    adjustments = (
        await db_session.execute(
            select(VacationAdjustment).where(VacationAdjustment.vacation_id == vacation_id)
        )
    ).scalars().all()
    assert len(adjustments) == 1
    assert adjustments[0].adjustment_order_id == committed.id


async def test_create_vacation_idempotent_with_committed_draft(
    db_session, create_employee, monkeypatch, tmp_path
):
    """#109: create_vacation после self-commit редактора возвращает автосозданный отпуск.

    Редактор коммитит vacation_paid-черновик → приказ + автозапись отпуска
    (_create_auto_vacation). Повторный create_vacation с тем же draft_id не
    создаёт дубль (unique uq_vacations_order_employee).
    """
    _prepare_drafts_dir(monkeypatch, tmp_path)

    employee = await create_employee(hire_date=date(2024, 1, 15))
    paid_type = await order_service.get_order_type_by_code(db_session, "vacation_paid")
    draft_id = str(uuid4())
    _write_draft(
        draft_id=draft_id,
        order_type_id=paid_type.id,
        employee_id=employee.id,
        order_type_code="vacation_paid",
        extra_fields={"vacation_start": "2026-08-10", "vacation_end": "2026-08-20"},
        order_number="V-201",
        order_date="2026-08-01",
    )

    committed = await order_service.create_single_order_from_draft(db_session, draft_id)

    result = await vacation_service.create_vacation(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 8, 10),
            "end_date": date(2026, 8, 20),
            "vacation_type": "Трудовой",
            "draft_id": draft_id,
        },
        "admin",
    )

    vacations = (
        await db_session.execute(select(Vacation).where(Vacation.order_id == committed.id))
    ).scalars().all()
    assert len(vacations) == 1, "не создаём дубль отпуска"
    assert result["id"] == vacations[0].id
    assert result["order_id"] == committed.id
    assert result["days_count"] == vacations[0].days_count


async def test_resolve_vacation_order_reuses_committed_draft(
    db_session, create_employee, monkeypatch, tmp_path
):
    """#109: _resolve_vacation_order с уже закоммиченным draft_id возвращает тот же Order.

    Не создаёт второй приказ (files черновика удалены self-commit'ом редактора #31).
    """
    _prepare_drafts_dir(monkeypatch, tmp_path)

    employee = await create_employee(hire_date=date(2024, 1, 15))
    recall_type = await order_service.get_order_type_by_code(db_session, "vacation_recall")
    draft_id = str(uuid4())
    _write_draft(
        draft_id=draft_id,
        order_type_id=recall_type.id,
        employee_id=employee.id,
        order_type_code="vacation_recall",
        extra_fields={},
        order_number="R-301",
    )

    committed = await order_service.create_single_order_from_draft(db_session, draft_id)
    assert await _count_orders_by_source_draft(db_session, draft_id) == 1

    from app.schemas.order import OrderCreate

    resolved = await vacation_service._resolve_vacation_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=recall_type.id,
            order_date=date(2026, 4, 4),
            order_number="R-301",
            draft_id=draft_id,
        ),
        draft_id,
    )

    assert resolved.id == committed.id
    assert await _count_orders_by_source_draft(db_session, draft_id) == 1


async def test_resolve_vacation_order_creates_when_draft_uncommitted(
    db_session, create_employee, monkeypatch, tmp_path
):
    """#109: для незакоммиченного черновика _resolve_vacation_order создаёт приказ."""
    _prepare_drafts_dir(monkeypatch, tmp_path)

    employee = await create_employee(hire_date=date(2024, 1, 15))
    recall_type = await order_service.get_order_type_by_code(db_session, "vacation_recall")
    draft_id = str(uuid4())
    _write_draft(
        draft_id=draft_id,
        order_type_id=recall_type.id,
        employee_id=employee.id,
        order_type_code="vacation_recall",
        extra_fields={},
        order_number="R-302",
    )

    from app.schemas.order import OrderCreate

    created = await vacation_service._resolve_vacation_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=recall_type.id,
            order_date=date(2026, 4, 4),
            order_number="R-302",
            draft_id=draft_id,
        ),
        draft_id,
    )

    assert await _count_orders_by_source_draft(db_session, draft_id) == 1
    assert created.order_number == "R-302"
    assert created.source_draft_id == draft_id
