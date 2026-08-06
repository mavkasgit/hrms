"""Списание дней отпуска: только с не закрытых периодов, от старых к новым."""
from datetime import date

import pytest

from app.services.vacation_period_service import auto_use_days

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_auto_use_days_skips_closed_period_and_debits_next_open(
    db_session,
    create_employee,
    create_order,
    create_vacation_period,
):
    employee = await create_employee(hire_date=date(2024, 1, 15))
    order = await create_order(employee=employee, order_number="100")

    # Старый период частично закрыт: остаток 21 зафиксирован (remaining_days).
    closed = await create_vacation_period(
        employee=employee,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=5,
        remaining_days=21,
        year_number=1,
    )
    # Следующий период открыт — с него и должны списываться дни.
    open_period = await create_vacation_period(
        employee=employee,
        period_start=date(2025, 1, 15),
        period_end=date(2026, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=0,
        remaining_days=None,
        year_number=2,
    )

    await auto_use_days(
        db_session,
        employee.id,
        days_to_use=8,
        hire_date=employee.hire_date,
        additional_days=0,
        order_id=order.id,
        order_number=order.order_number,
        transaction_type="vacation_use",
        original_order_id=order.id,
    )

    await db_session.refresh(closed)
    await db_session.refresh(open_period)

    assert closed.used_days == 5  # закрытый период не тронут
    assert open_period.used_days == 8  # списание ушло в первый открытый


async def test_auto_use_days_oldest_open_period_first(
    db_session,
    create_employee,
    create_order,
    create_vacation_period,
):
    employee = await create_employee(hire_date=date(2024, 1, 15))
    order = await create_order(employee=employee, order_number="101")

    p1 = await create_vacation_period(
        employee=employee,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=0,
        remaining_days=None,
        year_number=1,
    )
    p2 = await create_vacation_period(
        employee=employee,
        period_start=date(2025, 1, 15),
        period_end=date(2026, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=0,
        remaining_days=None,
        year_number=2,
    )

    # 30 дней не влезают в первый период целиком — остаток идёт во второй.
    await auto_use_days(
        db_session,
        employee.id,
        days_to_use=30,
        hire_date=employee.hire_date,
        additional_days=0,
        order_id=order.id,
        order_number=order.order_number,
        transaction_type="vacation_use",
        original_order_id=order.id,
    )

    await db_session.refresh(p1)
    await db_session.refresh(p2)
    assert p1.used_days == 24
    assert p2.used_days == 6
