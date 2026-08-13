"""Списание дней отпуска: только с не закрытых периодов, от старых к новым."""
from datetime import date

import pytest
from sqlalchemy import select

from app.models.vacation_period import VacationPeriod
from app.repositories.vacation_period_repository import VacationPeriodRepository
from app.services.vacation_period_service import auto_use_days, vacation_period_service

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


async def test_recompute_does_not_mark_open_period_as_closed(
    db_session,
    create_employee,
    create_order,
    create_vacation_period,
):
    """Регрессия: пересчёт остатка не должен «закрывать» открытый период.

    Раньше recompute_period_totals проставлял remaining_days любому периоду,
    из-за чего auto_use_days начинал считать открытый период закрытым и
    списывал дни следующего отпуска в новый будущий период.
    """
    employee = await create_employee(hire_date=date(2024, 1, 15))
    order_1 = await create_order(employee=employee, order_number="102")
    order_2 = await create_order(employee=employee, order_number="3")

    period = await create_vacation_period(
        employee=employee,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=0,
        remaining_days=None,
        year_number=1,
    )

    # Первый отпуск на 5 дней.
    await auto_use_days(
        db_session,
        employee.id,
        days_to_use=5,
        hire_date=employee.hire_date,
        additional_days=0,
        order_id=order_1.id,
        order_number=order_1.order_number,
        transaction_type="vacation_use",
        original_order_id=order_1.id,
    )

    await db_session.refresh(period)
    assert period.used_days == 5
    # Ключевое: период остаётся открытым (remaining_days == None).
    assert period.remaining_days is None

    # Второй отпуск на 8 дней должен списаться с того же открытого периода.
    await auto_use_days(
        db_session,
        employee.id,
        days_to_use=8,
        hire_date=employee.hire_date,
        additional_days=0,
        order_id=order_2.id,
        order_number=order_2.order_number,
        transaction_type="vacation_use",
        original_order_id=order_2.id,
    )

    await db_session.refresh(period)
    assert period.used_days == 13

    # Новых будущих периодов создано не было — 8 дней не ушли в «будущий период».
    all_periods = list(
        (
            await db_session.execute(
                select(VacationPeriod).where(VacationPeriod.employee_id == employee.id)
            )
        ).scalars().all()
    )
    assert len(all_periods) == 1


async def test_recompute_preserves_closed_period_remaining_days(
    db_session,
    create_employee,
    create_vacation_period,
):
    """Пересчёт итогов сохраняет явный остаток у закрытого периода.

    Признак закрытия — наличие manual/partial_close транзакции, поэтому после
    recompute_period_totals остаток закрытого периода должен остаться числом
    (не сброситься в NULL).
    """
    repo = VacationPeriodRepository()
    employee = await create_employee(hire_date=date(2024, 1, 15))
    period = await create_vacation_period(
        employee=employee,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=0,
        remaining_days=None,
        year_number=1,
    )

    # Частично закрываем: оставляем 5 дней (создаётся partial_close транзакция).
    await vacation_period_service.partial_close_period(db_session, period.id, remaining_days=5)
    await db_session.refresh(period)
    assert period.remaining_days == 5

    # Пересчитываем итоги — остаток закрытого периода не должен сброситься.
    await repo.recompute_period_totals(db_session, period.id)
    await db_session.refresh(period)
    assert period.remaining_days == 5
    assert period.used_days_manual == 19


async def test_recompute_clears_stale_remaining_days_on_open_period(
    db_session,
    create_employee,
    create_vacation_period,
):
    """Пересчёт сбрасывает «застрявший» остаток у периода без ручного закрытия.

    Самовосстановление для уже испорченных данных: если у открытого периода
    (без manual/partial_close транзакции) осталось числовое remaining_days,
    recompute_period_totals должен вернуть ему NULL.
    """
    repo = VacationPeriodRepository()
    employee = await create_employee(hire_date=date(2024, 1, 15))
    period = await create_vacation_period(
        employee=employee,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=0,
        remaining_days=21,  # испорченное значение без ручного закрытия
        year_number=1,
    )

    await repo.recompute_period_totals(db_session, period.id)
    await db_session.refresh(period)
    assert period.remaining_days is None
