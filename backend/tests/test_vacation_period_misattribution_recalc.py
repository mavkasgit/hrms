"""Пересчёт трудовых периодов для сотрудников с мизатрибуцией автосписания.

Мизатрибуция — фактическое распределение дней отпуска расходится с эталонным
FIFO (самый старый незакрытый период первым) либо автосписание отсутствует.
Легитимный перелив назад (отпуск стартует в новом периоде, дни уходят в более
старые открытые) и вперёд (период старта закрыт) — норма, не флагается.

Скрипт: scripts/recalculate_misattributed_vacations.py
"""
from datetime import date

import pytest
from sqlalchemy import select

from app.models.vacation_period import VacationPeriod
from app.repositories.vacation_period_repository import VacationPeriodRepository
from app.services.vacation_period_service import vacation_period_service
from app.services.vacation_service import vacation_service
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


async def _add_auto_use(db, period_id, days, order, vacation, description="Автосписание"):
    """Пишет автосписание отпуска в период (used_days + транзакция)."""
    repo = VacationPeriodRepository()
    await repo.add_used_days(db, period_id, days, order.id, order.order_number)
    await repo.add_transaction(
        db,
        period_id=period_id,
        days_count=days,
        transaction_type="vacation_use",
        order_id=order.id,
        order_number=order.order_number,
        vacation_id=vacation.id,
        original_order_id=order.id,
        source_type="vacation",
        description=description,
        recompute_totals=True,
    )
    await db.flush()


async def _create_two_open_periods(create_vacation_period, employee):
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
    return p1, p2


async def _setup_misattributed(db_session, create_employee, create_order, create_vacation, create_vacation_period):
    """Создаёт сотрудника с мизатрибуцией автосписания (эффект старого бага):
    период 1 частично закрыт (остаток 21), отпуск 27 дн. начинается в периоде 1,
    но все 27 дн. списаны во 2-й период. Возвращает (employee, order)."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    order = await create_order(employee=employee, order_number="200")

    p1, p2 = await _create_two_open_periods(create_vacation_period, employee)

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
    await _add_auto_use(db_session, p2.id, 27, order, vacation, description="Автосписание (мизатрибуция)")
    return employee, order


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
    employee, _ = await _setup_misattributed(
        db_session, create_employee, create_order, create_vacation, create_vacation_period
    )

    # Скрипт находит сотрудника: факт (27 в периоде 2) расходится с эталоном (21 + 6).
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


async def test_ignores_legitimate_fifo_overflow_to_older_period(
    db_session,
    create_employee,
    create_order,
    create_vacation,
    create_vacation_period,
):
    """FIFO-перелив назад не флагается (#124).

    Отпуск стартует во 2-м периоде, но все дни уходят в более старый открытый
    1-й период — это ровно то, что предписывает FIFO, а не мизатрибуция.
    """
    employee = await create_employee(hire_date=date(2024, 1, 15))
    order = await create_order(employee=employee, order_number="300")
    p1, p2 = await _create_two_open_periods(create_vacation_period, employee)

    vacation = await create_vacation(
        employee=employee,
        start_date=date(2025, 3, 1),
        end_date=date(2025, 3, 20),
        days_count=20,
        vacation_type="Трудовой",
        order_id=order.id,
    )
    # Все 20 дн. легитимно в периоде 1, хотя отпуск датирован периодом 2.
    await _add_auto_use(db_session, p1.id, 20, order, vacation)

    assert await find_misattributed_employee_ids(db_session) == []

    # Пересчёт не меняет картину: эталон совпадает с фактом.
    await vacation_period_service.recalculate_periods(db_session, employee.id)
    assert await find_misattributed_employee_ids(db_session) == []
    assert (await _period(db_session, employee.id, 1)).used_days == 20
    assert (await _period(db_session, employee.id, 2)).used_days == 0


async def test_ignores_legitimate_fifo_overflow_to_later_period(
    db_session,
    create_employee,
    create_order,
    create_vacation,
    create_vacation_period,
):
    """Перелив вперёд (период старта закрыт) — тоже норма, а не мизатрибуция."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    order = await create_order(employee=employee, order_number="301")
    p1, p2 = await _create_two_open_periods(create_vacation_period, employee)

    # 1-й период полностью закрыт: свободного остатка под автосписание нет.
    await vacation_period_service.partial_close_period(db_session, p1.id, remaining_days=0)
    await db_session.refresh(p1)

    vacation = await create_vacation(
        employee=employee,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 10),
        days_count=10,
        vacation_type="Трудовой",
        order_id=order.id,
    )
    # Дни уходят в следующий открытый период — это ожидаемый FIFO-исход.
    await _add_auto_use(db_session, p2.id, 10, order, vacation)

    assert await find_misattributed_employee_ids(db_session) == []


async def test_flags_vacation_without_auto_write_off(
    db_session,
    create_employee,
    create_order,
    create_vacation,
    create_vacation_period,
):
    """Отпуск с приказом вообще без автосписания считается мизатрибуцией."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    order = await create_order(employee=employee, order_number="302")
    await _create_two_open_periods(create_vacation_period, employee)

    await create_vacation(
        employee=employee,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 10),
        days_count=10,
        vacation_type="Трудовой",
        order_id=order.id,
    )

    assert await find_misattributed_employee_ids(db_session) == [employee.id]

    # Пересчёт восстанавливает эталонное списание.
    await vacation_period_service.recalculate_periods(db_session, employee.id)
    assert await find_misattributed_employee_ids(db_session) == []
    assert (await _period(db_session, employee.id, 1)).used_days == 10


async def test_ignores_adjusted_vacation_net_allocation(db_session, create_employee):
    """Отзыв отпуска (сторно + повторное списание) — не мизатрибуция.

    В журнале остаются исходные дни, сторно и новое списание; детектор
    сравнивает нетто, поэтому скорректированный отпуск не флагается.
    """
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await vacation_service.create_vacation(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 4, 1),
            "end_date": date(2026, 4, 11),
            "vacation_type": "Трудовой",
            "comment": "adjustment-regression",
        },
        "admin",
    )
    await vacation_service.recall_vacation(
        db_session,
        created["id"],
        {
            "recall_date": date(2026, 4, 5),
            "order_date": date(2026, 4, 4),
            "order_number": "R-124",
            "comment": "recall for detector regression",
        },
        "admin",
    )

    assert await find_misattributed_employee_ids(db_session) == []


async def test_ignores_employee_without_misattribution(
    db_session,
    create_employee,
    create_order,
    create_vacation,
    create_vacation_period,
):
    """Корректно распределённый отпуск не считается мизатрибуцией."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    order = await create_order(employee=employee, order_number="303")
    p1, _ = await _create_two_open_periods(create_vacation_period, employee)
    vacation = await create_vacation(
        employee=employee,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 5),
        days_count=5,
        vacation_type="Трудовой",
        order_id=order.id,
    )
    await _add_auto_use(db_session, p1.id, 5, order, vacation)

    # Отпуск стартует и списан в самом старом открытом периоде — совпадает с эталоном.
    assert await find_misattributed_employee_ids(db_session) == []


async def test_recalculate_is_idempotent(
    db_session,
    create_employee,
    create_order,
    create_vacation,
    create_vacation_period,
):
    """Повторный пересчёт даёт тот же результат (идемпотентность)."""
    employee, _ = await _setup_misattributed(
        db_session, create_employee, create_order, create_vacation, create_vacation_period
    )

    await vacation_period_service.recalculate_periods(db_session, employee.id)

    first = await _period(db_session, employee.id, 1)
    first_p2 = await _period(db_session, employee.id, 2)

    await vacation_period_service.recalculate_periods(db_session, employee.id)

    second = await _period(db_session, employee.id, 1)
    second_p2 = await _period(db_session, employee.id, 2)

    assert (first.used_days, first.remaining_days) == (second.used_days, second.remaining_days)
    assert (first_p2.used_days, first_p2.remaining_days) == (second_p2.used_days, second_p2.remaining_days)
