"""Регрессия #64: дубли отпусков по одному приказу.

Форма «Создать трудовой отпуск» раньше создавала две записи отпуска:
автозапись в order_service при создании приказа + явная запись в
vacation_service. После фикса один клик в форме создаёт ровно одну запись,
а нарушение уникальности (order_id, employee_id) в обеих точках вставки
возвращает 409 (DuplicateVacationForOrderError).
"""
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import DuplicateVacationForOrderError
from app.repositories.vacation_repository import vacation_repository
from app.schemas.order import OrderCreate
from app.services.order_service import order_service
from app.services.vacation_service import vacation_service

WORK_VACATION_TYPE = "Трудовой"

pytestmark = pytest.mark.asyncio(loop_scope="module")

_NO_HOLIDAYS = AsyncMock(return_value=[])
_NO_AUTO_USE = AsyncMock()


def _vacation_payload(employee_id: int, **overrides) -> dict:
    payload = {
        "employee_id": employee_id,
        "start_date": date(2024, 6, 1),
        "end_date": date(2024, 6, 5),
        "vacation_type": WORK_VACATION_TYPE,
        "comment": "dedup-regression",
    }
    payload.update(overrides)
    return payload


async def test_create_vacation_creates_single_record(db_session, create_employee):
    """Один клик в форме = ровно одна запись отпуска (а не две)."""
    employee = await create_employee(hire_date=date(2023, 1, 15))

    with patch(
        "app.services.vacation_service.references_repository.get_holidays_for_year",
        new=_NO_HOLIDAYS,
    ), patch("app.services.vacation_service.auto_use_days", new=_NO_AUTO_USE):
        result = await vacation_service.create_vacation(
            db_session, _vacation_payload(employee.id), "admin"
        )

    vacations = await vacation_repository.get_by_employee_id(db_session, employee.id)
    assert len(vacations) == 1
    assert vacations[0].order_id == result["order_id"]


async def test_update_vacation_does_not_create_extra_record(db_session, create_employee):
    """Пересоздание приказа при редактировании не плодит вторую запись отпуска."""
    employee = await create_employee(hire_date=date(2023, 1, 15))

    with patch(
        "app.services.vacation_service.references_repository.get_holidays_for_year",
        new=_NO_HOLIDAYS,
    ), patch("app.services.vacation_service.auto_use_days", new=_NO_AUTO_USE):
        created = await vacation_service.create_vacation(
            db_session, _vacation_payload(employee.id), "admin"
        )
    old_order_id = created["order_id"]
    assert old_order_id is not None

    with patch(
        "app.services.vacation_service.references_repository.get_holidays_for_year",
        new=_NO_HOLIDAYS,
    ):
        updated = await vacation_service.update_vacation(
            db_session,
            created["id"],
            {"end_date": date(2024, 6, 7)},
            "admin",
        )

    # Приказ пересоздан, но запись отпуска осталась одна.
    assert updated["order_id"] != old_order_id
    vacations = await vacation_repository.get_by_employee_id(db_session, employee.id)
    assert len(vacations) == 1
    assert vacations[0].order_id == updated["order_id"]


async def test_order_service_duplicate_guard_returns_409(
    db_session, create_employee, create_order, create_vacation, create_order_type
):
    """Защита в order_service: автозапись при уже существующем отпуске → 409."""
    employee = await create_employee()
    order_type = await create_order_type(code="vacation_paid", name="Трудовой отпуск")
    order = await create_order(
        employee=employee,
        order_type_obj=order_type,
        order_number="888",
    )
    await create_vacation(employee=employee, order_id=order.id)

    data = OrderCreate(
        employee_id=employee.id,
        order_type_id=order_type.id,
        order_date=date(2026, 4, 1),
        extra_fields={"vacation_start": "2026-04-01", "vacation_end": "2026-04-05"},
    )

    with patch(
        "app.repositories.references_repository.references_repository.get_holidays_for_year",
        new=_NO_HOLIDAYS,
    ):
        with pytest.raises(DuplicateVacationForOrderError) as exc_info:
            await order_service._create_auto_vacation(
                db_session, data, order, employee, order_type, data.extra_fields
            )
    assert exc_info.value.status_code == 409


async def test_vacation_repository_translates_unique_violation_to_409(
    db_session, create_employee, create_order
):
    """Unique-нарушение (order_id, employee_id) на вставке → 409, а не 500."""
    from app.repositories.vacation_repository import vacation_repository

    employee = await create_employee()
    order = await create_order(employee=employee, order_number="555")

    def _unique_violation() -> IntegrityError:
        exc = IntegrityError("INSERT INTO vacations", {}, Exception("duplicate"))
        orig = type("Orig", (), {"constraint_name": "uq_vacations_order_employee"})()
        exc.orig = orig  # type: ignore[attr-defined]
        raise exc

    with patch.object(
        db_session, "flush", side_effect=_unique_violation
    ):
        with pytest.raises(DuplicateVacationForOrderError) as exc_info:
            await vacation_repository.create(
                db_session,
                {
                    "employee_id": employee.id,
                    "start_date": date(2026, 4, 1),
                    "end_date": date(2026, 4, 5),
                    "vacation_type": WORK_VACATION_TYPE,
                    "days_count": 5,
                    "vacation_year": 2026,
                    "order_id": order.id,
                },
            )
    assert exc_info.value.status_code == 409


async def test_direct_order_auto_creates_vacation_when_not_skipped(db_session, create_employee):
    """Путь «создать приказ об отпуске напрямую» продолжает автогенерить отпуск."""
    employee = await create_employee()
    await order_service.ensure_default_order_types(db_session)
    order_type = await order_service.get_order_type_by_code(db_session, "vacation_paid")

    data = OrderCreate(
        employee_id=employee.id,
        order_type_id=order_type.id,
        order_date=date(2026, 4, 1),
        extra_fields={"vacation_start": "2026-04-01", "vacation_end": "2026-04-05"},
    )
    order = await order_service.create_order(db_session, data)

    vacations = await vacation_repository.get_by_employee_id(db_session, employee.id)
    assert len(vacations) == 1
    assert vacations[0].order_id == order.id

    # Прямой путь списывает дни с периодов, как и форма (#64).
    from sqlalchemy import func as sa_func, select as sa_select

    from app.models.vacation_period_transaction import VacationPeriodTransaction

    tx_count = (
        await db_session.execute(
            sa_select(sa_func.count(VacationPeriodTransaction.id)).where(
                VacationPeriodTransaction.vacation_id == vacations[0].id
            )
        )
    ).scalar() or 0
    assert tx_count >= 1


async def test_order_with_skip_auto_vacation_creates_no_vacation(db_session, create_employee):
    """skip_auto_vacation=True отключает автозапись отпуска в order_service."""
    employee = await create_employee()
    await order_service.ensure_default_order_types(db_session)
    order_type = await order_service.get_order_type_by_code(db_session, "vacation_paid")

    data = OrderCreate(
        employee_id=employee.id,
        order_type_id=order_type.id,
        order_date=date(2026, 4, 1),
        extra_fields={"vacation_start": "2026-04-01", "vacation_end": "2026-04-05"},
        skip_auto_vacation=True,
    )
    await order_service.create_order(db_session, data)

    vacations = await vacation_repository.get_by_employee_id(db_session, employee.id)
    assert vacations == []
