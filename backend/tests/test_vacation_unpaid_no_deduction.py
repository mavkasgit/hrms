"""Регрессия c16d740: «Отпуск за свой счет» НЕ должен уменьшать баланс трудового.

До c16d740: только форма отпуска дёргала auto_use_days, и то без проверки типа.
c16d740 добавил auto_use_days в прямой приказ (POST /orders) — но по ошибке
включил vacation_unpaid в условие, из-за чего «за свой счёт» начал списывать
дни с vacation_periods. Этот файл закрывает регрессию и в form-пути.
"""
from datetime import date
from typing import Awaitable, Callable

import pytest
from sqlalchemy import select

from app.models.employee import Employee
from app.models.order_type import OrderType
from app.models.vacation import Vacation
from app.models.vacation_period import VacationPeriod
from app.models.vacation_period_transaction import VacationPeriodTransaction
from app.schemas.order import (
    OrderCreate,
    VacationUnpaidGroupEmployeeCreate,
    VacationUnpaidGroupOrderCreate,
)
from app.services.order_service import order_service
from app.services.vacation_period_service import auto_use_days

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _make_employee_with_period(create_employee, additional_days: int = 0) -> Employee:
    return await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=additional_days,
    )


async def _ensure_order_type(
    db_session,
    create_order_type: Callable[..., Awaitable[OrderType]],
    code: str,
) -> OrderType:
    """Возвращает существующий OrderType по коду или создаёт новый."""
    result = await db_session.execute(
        select(OrderType).where(OrderType.code == code)
    )
    ot = result.scalar_one_or_none()
    if ot is not None:
        return ot
    return await create_order_type(code=code, name=code)


async def test_auto_use_days_rejects_non_paid_vacation_type(db_session, create_employee):
    """Инвариант: auto_use_days допускает только 'Трудовой' (ADR-0012)."""
    employee = await _make_employee_with_period(create_employee)
    with pytest.raises(ValueError, match="vacation_type"):
        await auto_use_days(
            db_session,
            employee_id=employee.id,
            days_to_use=3,
            hire_date=employee.hire_date,
            vacation_type="За свой счет",
        )


async def test_unpaid_order_does_not_deduct_from_period(
    db_session,
    create_employee,
    create_order_type,
    create_vacation_period,
):
    """Прямой приказ vacation_unpaid (POST /orders) НЕ должен создавать
    транзакцию списания в vacation_period_transactions и НЕ должен менять
    used_days/used_days_auto периода."""
    employee = await _make_employee_with_period(create_employee)
    period = await create_vacation_period(
        employee_id=employee.id,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        year_number=1,
        main_days=24,
        additional_days=0,
    )
    used_before = period.used_days or 0

    ot_unpaid = await _ensure_order_type(db_session, create_order_type, "vacation_unpaid")

    order = await order_service.create_order(
        db_session,
        OrderCreate(
            order_type_id=ot_unpaid.id,
            order_type_code="vacation_unpaid",
            order_number="REGR-001",
            order_date=date(2027, 1, 10),
            employee_id=employee.id,
            extra_fields={
                "vacation_start": "2027-01-11",
                "vacation_end": "2027-01-15",
            },
        ),
    )
    await db_session.commit()

    # Запись vacation создаётся
    vacation_result = await db_session.execute(
        select(Vacation).where(Vacation.order_id == order.id)
    )
    vacation = vacation_result.scalar_one()
    assert vacation.vacation_type == "Отпуск за свой счет"
    assert vacation.days_count == 5

    # НО транзакций списания НЕТ
    tx_result = await db_session.execute(
        select(VacationPeriodTransaction).where(
            VacationPeriodTransaction.vacation_id == vacation.id
        )
    )
    assert tx_result.scalars().all() == []

    # used_days/used_days_auto не изменились
    await db_session.refresh(period)
    assert period.used_days == used_before
    assert period.used_days_auto == 0


async def test_paid_order_still_deducts(
    db_session,
    create_employee,
    create_order_type,
    create_vacation_period,
):
    """Позитивная регрессия: vacation_paid через прямой приказ ВСЁ ЕЩЁ списывает.
    Защита от пере-фикса (c16d740 фича сохраняется)."""
    employee = await _make_employee_with_period(create_employee)
    period = await create_vacation_period(
        employee_id=employee.id,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        year_number=1,
        main_days=24,
        additional_days=0,
    )

    ot_paid = await _ensure_order_type(db_session, create_order_type, "vacation_paid")

    order = await order_service.create_order(
        db_session,
        OrderCreate(
            order_type_id=ot_paid.id,
            order_type_code="vacation_paid",
            order_number="REGR-002",
            order_date=date(2027, 2, 1),
            employee_id=employee.id,
            extra_fields={
                "vacation_start": "2027-02-08",
                "vacation_end": "2027-02-12",
            },
        ),
    )
    await db_session.commit()

    vacation_result = await db_session.execute(
        select(Vacation).where(Vacation.order_id == order.id)
    )
    vacation = vacation_result.scalar_one()

    tx_result = await db_session.execute(
        select(VacationPeriodTransaction).where(
            VacationPeriodTransaction.vacation_id == vacation.id
        )
    )
    txs = tx_result.scalars().all()
    assert len(txs) == 1
    assert txs[0].transaction_type == "vacation_use"
    assert txs[0].days_count == 5

    await db_session.refresh(period)
    assert period.used_days == 5
    assert period.used_days_auto == 5


async def test_group_unpaid_does_not_deduct(
    db_session,
    create_employee,
    create_order_type,
    create_vacation_period,
):
    """Групповой vacation_unpaid_group по-прежнему не трогает периоды
    (там auto_use_days не вызывается вообще)."""
    employees = [
        await _make_employee_with_period(create_employee),
        await _make_employee_with_period(create_employee),
    ]
    for emp in employees:
        await create_vacation_period(
            employee_id=emp.id,
            period_start=date(2024, 1, 15),
            period_end=date(2025, 1, 14),
            year_number=1,
            main_days=24,
            additional_days=0,
        )

    period_snapshots: dict[int, int] = {}
    for emp in employees:
        result = await db_session.execute(
            select(VacationPeriod).where(VacationPeriod.employee_id == emp.id)
        )
        period_snapshots[emp.id] = result.scalar_one().used_days or 0

    await order_service.create_vacation_unpaid_group_order(
        db_session,
        VacationUnpaidGroupOrderCreate(
            order_number="REGR-GRP-001",
            order_date=date(2027, 3, 1),
            vacation_start=date(2027, 3, 8),
            employees=[
                VacationUnpaidGroupEmployeeCreate(
                    employee_id=emp.id,
                    vacation_days=5,
                )
                for emp in employees
            ],
        ),
    )
    await db_session.commit()

    for emp in employees:
        result = await db_session.execute(
            select(VacationPeriod).where(VacationPeriod.employee_id == emp.id)
        )
        period = result.scalar_one()
        assert period.used_days == period_snapshots[emp.id], (
            f"Групповой unpaid изменил used_days сотрудника {emp.id}"
        )
