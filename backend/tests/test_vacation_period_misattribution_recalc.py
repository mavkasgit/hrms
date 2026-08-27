"""Пересчёт трудовых периодов для сотрудников с мизатрибуцией автосписания.

Мизатрибуция — автосписание отпуска, записанное в период, НЕ содержащий дату
начала отпуска (последствие пре-фиксной версии автосписания до #114: частично
закрытые периоды пропускались, и дни уходили в следующий период).

Скрипт: scripts/recalculate_misattributed_vacations.py
"""
from datetime import date

import pytest
from sqlalchemy import select

from app.models.vacation_period import VacationPeriod
from app.repositories.vacation_period_repository import VacationPeriodRepository
from app.services.vacation_period_service import vacation_period_service
from scripts.recalculate_misattributed_vacations import find_misattributed_employee_ids

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _period(db, employee_id, year_number):
    result = await db.execute(
        select(VacationPeriod).where(
            VacationPeriod.employee_id == employee_id,
            VacationPeriod.year_number == year_number,
        )
    )
    return result.scalar_one()


async def test_finds_and_recalculates_misattributed_employee(
    db_session,
    create_employee,
    create_order,
    create_vacation,
    create_vacation_period,
):
    """Сотрудник с мизатрибуцией находится и пересчитывается по FIFO.

    Сценарий (эффект старого бага):
    - период 1 частично закрыт (остаток 21);
    - отпуск 27 дн. начинается в периоде 1;
    - старый баг пропустил частично закрытый период и списал все 27 дн. во 2-й.
    После пересчёта: 21 дн. уходит в период 1 (доедает до 0), 6 дн. во 2-й.
    """
    employee = await create_employee(hire_date=date(2024, 1, 15))
    order = await create_order(employee=employee, order_number="200")

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

    # Частично закрываем первый период: остаток 21 (used 3).
    await vacation_period_service.partial_close_period(db_session, p1.id, remaining_days=21)
    await db_session.refresh(p1)

    # Отпуск начинается в периоде 1.
    vacation = await create_vacation(
        employee=employee,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 27),
        days_count=27,
        vacation_type="Трудовой",
        order_id=order.id,
    )

    # Старый баг: все 27 дн. ушли во 2-й период (мизатрибуция).
    repo = VacationPeriodRepository()
    await repo.add_used_days(db_session, p2.id, 27, order.id, order.order_number)
    await repo.add_transaction(
        db_session,
        period_id=p2.id,
        days_count=27,
        transaction_type="vacation_use",
        order_id=order.id,
        order_number=order.order_number,
        vacation_id=vacation.id,
        original_order_id=order.id,
        source_type="vacation",
        description="Автосписание (мизатрибуция)",
        recompute_totals=True,
    )
    await db_session.flush()

    # Скрипт находит сотрудника.
    assert await find_misattributed_employee_ids(db_session) == [employee.id]

    # Пересчёт.
    await vacation_period_service.recalculate_periods(db_session, employee.id)

    # Мизатрибуция устранена.
    assert await find_misattributed_employee_ids(db_session) == []

    # Балансы соответствуют FIFO-логике (периоды пересозданы — читаем заново).
    period1 = await _period(db_session, employee.id, 1)
    period2 = await _period(db_session, employee.id, 2)
    assert period1.used_days == 24
    assert period1.remaining_days == 0
    assert period2.used_days == 6


async def test_ignores_employee_without_misattribution(
    db_session,
    create_employee,
    create_vacation,
    create_vacation_period,
):
    """Корректно распределённый отпуск не считается мизатрибуцией."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    p1 = await create_vacation_period(
        employee=employee,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=5,
        remaining_days=None,
        year_number=1,
    )
    await create_vacation(
        employee=employee,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 5),
        days_count=5,
        vacation_type="Трудовой",
    )

    # Отпуск стартует и списан в одном и том же периоде — мизатрибуции нет.
    assert await find_misattributed_employee_ids(db_session) == []


async def test_recalculate_is_idempotent(
    db_session,
    create_employee,
    create_order,
    create_vacation,
    create_vacation_period,
):
    """Повторный пересчёт даёт тот же результат (идемпотентность)."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    order = await create_order(employee=employee, order_number="201")

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

    await vacation_period_service.partial_close_period(db_session, p1.id, remaining_days=21)
    await db_session.refresh(p1)

    vacation = await create_vacation(
        employee=employee,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 27),
        days_count=27,
        vacation_type="Трудовой",
        order_id=order.id,
    )

    repo = VacationPeriodRepository()
    await repo.add_used_days(db_session, p2.id, 27, order.id, order.order_number)
    await repo.add_transaction(
        db_session,
        period_id=p2.id,
        days_count=27,
        transaction_type="vacation_use",
        order_id=order.id,
        order_number=order.order_number,
        vacation_id=vacation.id,
        original_order_id=order.id,
        source_type="vacation",
        description="Автосписание (мизатрибуция)",
        recompute_totals=True,
    )
    await db_session.flush()

    await vacation_period_service.recalculate_periods(db_session, employee.id)

    first = await _period(db_session, employee.id, 1)
    first_p2 = await _period(db_session, employee.id, 2)

    await vacation_period_service.recalculate_periods(db_session, employee.id)

    second = await _period(db_session, employee.id, 1)
    second_p2 = await _period(db_session, employee.id, 2)

    assert (first.used_days, first.remaining_days) == (second.used_days, second.remaining_days)
    assert (first_p2.used_days, first_p2.remaining_days) == (second_p2.used_days, second_p2.remaining_days)
