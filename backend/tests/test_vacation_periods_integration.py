from datetime import date

import pytest

from app.repositories.vacation_period_repository import VacationPeriodRepository
from app.services.vacation_period_service import auto_use_days, vacation_period_service


pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_close_period_consumes_remaining_days(db_session, create_employee):
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=5,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    periods_before = await vacation_period_service.get_employee_periods(db_session, employee.id)
    first_period = next(period for period in periods_before if period.year_number == 1)

    assert first_period.total_days == 29
    assert first_period.used_days == 0
    assert first_period.remaining_days == 29

    closed = await vacation_period_service.close_period(db_session, first_period.period_id)

    assert closed.total_days == 29
    assert closed.used_days == 29
    assert closed.used_days_auto == 0
    assert closed.used_days_manual == 29
    assert closed.remaining_days == 0

    periods_after = await vacation_period_service.get_employee_periods(db_session, employee.id)
    closed_period = next(period for period in periods_after if period.period_id == first_period.period_id)

    assert closed_period.used_days == 29
    assert closed_period.remaining_days == 0


async def test_partial_close_keeps_requested_remaining_days(db_session, create_employee):
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=0,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    periods_before = await vacation_period_service.get_employee_periods(db_session, employee.id)
    first_period = next(period for period in periods_before if period.year_number == 1)

    partial = await vacation_period_service.partial_close_period(
        db_session,
        first_period.period_id,
        remaining_days=5,
    )

    assert partial.total_days == 24
    assert partial.used_days == 19
    assert partial.used_days_auto == 0
    assert partial.used_days_manual == 19
    assert partial.remaining_days == 5

    periods_after = await vacation_period_service.get_employee_periods(db_session, employee.id)
    updated_period = next(period for period in periods_after if period.period_id == first_period.period_id)

    assert updated_period.used_days == 19
    assert updated_period.remaining_days == 5


async def test_partial_close_cannot_increase_remaining(db_session, create_employee):
    """partial_close не может увеличить остаток — только уменьшить."""
    from fastapi import HTTPException

    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=3,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    periods = await vacation_period_service.get_employee_periods(db_session, employee.id)
    first_period = next(period for period in periods if period.year_number == 1)

    # Частично закрываем: оставляем 10 дней
    await vacation_period_service.partial_close_period(
        db_session,
        first_period.period_id,
        remaining_days=10,
    )

    # Попытка увеличить остаток через partial_close → ошибка
    with pytest.raises(HTTPException) as exc_info:
        await vacation_period_service.partial_close_period(
            db_session,
            first_period.period_id,
            remaining_days=20,
        )
    assert exc_info.value.status_code == 400
    assert "нельзя" in str(exc_info.value.detail).lower()


async def test_close_period_preserves_auto_used_days_and_spends_only_remainder(
    db_session,
    create_employee,
    create_order,
    create_vacation,
):
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=5,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    repo = VacationPeriodRepository()
    periods = await repo.get_by_employee(db_session, employee.id)
    first_period = next(period for period in periods if period.year_number == 1)

    order = await create_order(employee=employee, order_number="87")
    await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 10),
        days_count=10,
        vacation_year=2024,
    )
    await repo.add_used_days(db_session, first_period.id, 10, order.id, order.order_number)

    closed = await vacation_period_service.close_period(db_session, first_period.id)

    assert closed.total_days == 29
    assert closed.used_days_auto == 10
    assert closed.used_days_manual == 19
    assert closed.used_days == 29
    assert closed.remaining_days == 0


async def test_auto_use_days_spends_oldest_period_first(db_session, create_employee):
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=0,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    await auto_use_days(db_session, employee.id, 7)

    repo = VacationPeriodRepository()
    periods = await repo.get_by_employee(db_session, employee.id)

    first_period = next(period for period in periods if period.year_number == 1)
    second_period = next(period for period in periods if period.year_number == 2)

    assert first_period.used_days == 7
    assert first_period.used_days_auto == 7
    assert second_period.used_days == 0


async def test_auto_use_days_creates_future_periods_when_not_enough_balance(
    db_session,
    create_employee,
):
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=0,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    # Списываем 40 дней, хотя доступно только 24 в первом периоде
    await auto_use_days(
        db_session,
        employee.id,
        40,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    repo = VacationPeriodRepository()
    periods = await repo.get_by_employee(db_session, employee.id)
    periods_by_year = {p.year_number: p for p in periods}

    assert 1 in periods_by_year
    assert 2 in periods_by_year

    first = periods_by_year[1]
    second = periods_by_year[2]

    assert first.used_days == 24
    assert first.used_days_auto == 24
    assert second.used_days == 16
    assert second.used_days_auto == 16


async def test_auto_use_days_creates_multiple_future_periods_for_large_overdraft(
    db_session,
    create_employee,
):
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=0,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    # Списываем 55 дней — больше двух периодов (24 + 24 = 48)
    await auto_use_days(
        db_session,
        employee.id,
        55,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    repo = VacationPeriodRepository()
    periods = await repo.get_by_employee(db_session, employee.id)
    periods_by_year = {p.year_number: p for p in periods}

    assert 1 in periods_by_year
    assert 2 in periods_by_year
    assert 3 in periods_by_year

    assert periods_by_year[1].used_days == 24
    assert periods_by_year[2].used_days == 24
    assert periods_by_year[3].used_days == 7


async def test_add_vacation_to_partially_closed_period(
    db_session,
    create_employee,
    create_order,
    create_vacation,
):
    """Сценарий 1: Добавление отпуска в частично закрытый период.

    Период 24 дня → частично закрыт (остаток 10) → добавляем отпуск 8 дней.
    Ожидание: auto_use_days возьмёт 8 из оставшихся 10, остаток станет 2.
    """
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=0,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    repo = VacationPeriodRepository()
    orm_periods = await repo.get_by_employee(db_session, employee.id)
    first_period = next(p for p in orm_periods if p.year_number == 1)

    # Частично закрываем: оставляем 10 дней
    partial = await vacation_period_service.partial_close_period(
        db_session,
        first_period.id,
        remaining_days=10,
    )
    assert partial.remaining_days == 10
    assert partial.used_days == 14
    assert partial.used_days_manual == 14

    # Создаём отпуск на 8 дней
    order = await create_order(employee=employee, order_number="100")
    await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 10),
        days_count=8,
        vacation_year=2024,
    )

    await repo.add_used_days(db_session, first_period.id, 8, order.id, order.order_number)

    # Перечитываем период
    updated = await vacation_period_service.get_employee_periods(db_session, employee.id)
    updated_period = next(p for p in updated if p.period_id == first_period.id)

    # used_days_auto=8, used_days_manual=14, total used=22, remaining=2
    assert updated_period.used_days_auto == 8
    assert updated_period.used_days_manual == 14
    assert updated_period.used_days == 22
    assert updated_period.remaining_days == 2


async def test_partial_close_period_with_existing_vacations(
    db_session,
    create_employee,
    create_order,
    create_vacation,
):
    """Сценарий 2: Частичное закрытие периода с существующим отпуском.

    Период 24 дня → отпуск 10 дней (auto) → частичное закрытие (остаток 5).
    Ожидание: manual = 24 - 10 - 5 = 9, total used = 19, remaining = 5.
    """
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=0,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    repo = VacationPeriodRepository()
    orm_periods = await repo.get_by_employee(db_session, employee.id)
    first_period = next(p for p in orm_periods if p.year_number == 1)

    # Создаём отпуск на 10 дней
    order = await create_order(employee=employee, order_number="101")
    await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 10),
        days_count=10,
        vacation_year=2024,
    )
    await repo.add_used_days(db_session, first_period.id, 10, order.id, order.order_number)

    # Перечитываем
    before_close = await vacation_period_service.get_employee_periods(db_session, employee.id)
    before_period = next(p for p in before_close if p.period_id == first_period.id)
    assert before_period.used_days_auto == 10
    assert before_period.remaining_days == 14

    # Частично закрываем: оставляем 5 дней
    closed = await vacation_period_service.partial_close_period(
        db_session,
        first_period.id,
        remaining_days=5,
    )

    assert closed.total_days == 24
    assert closed.used_days_auto == 10
    assert closed.used_days_manual == 9  # 24 - 10 - 5
    assert closed.used_days == 19
    assert closed.remaining_days == 5


async def test_full_close_period_with_existing_vacations(
    db_session,
    create_employee,
    create_order,
    create_vacation,
):
    """Полное закрытие периода с существующим отпуском.

    Период 24 дня → отпуск 10 дней (auto) → полное закрытие.
    Ожидание: manual = 24 - 10 = 14, total used = 24, remaining = 0.
    """
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=0,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    repo = VacationPeriodRepository()
    periods = await repo.get_by_employee(db_session, employee.id)
    first_period = next(period for period in periods if period.year_number == 1)

    # Создаём отпуск на 10 дней
    order = await create_order(employee=employee, order_number="102")
    await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 10),
        days_count=10,
        vacation_year=2024,
    )
    await repo.add_used_days(db_session, first_period.id, 10, order.id, order.order_number)

    # Полное закрытие
    closed = await vacation_period_service.close_period(db_session, first_period.id)

    assert closed.total_days == 24
    assert closed.used_days_auto == 10
    assert closed.used_days_manual == 14  # 24 - 10
    assert closed.used_days == 24
    assert closed.remaining_days == 0


async def test_restore_via_cancel_closure_transaction(
    db_session,
    create_employee,
    create_order,
    create_vacation,
):
    """Восстановление периода через отмену транзакции ручного закрытия.

    Период 24 дня → полное закрытие → отмена транзакции → отпуск 8 дней.
    Ожидание: после отмены remaining=24, после отпуска remaining=16.
    """
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=0,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    repo = VacationPeriodRepository()
    orm_periods = await repo.get_by_employee(db_session, employee.id)
    first_period = next(p for p in orm_periods if p.year_number == 1)

    # Полное закрытие
    await vacation_period_service.close_period(db_session, first_period.id)
    closed = await vacation_period_service.get_employee_periods(db_session, employee.id)
    closed_period = next(p for p in closed if p.period_id == first_period.id)
    assert closed_period.remaining_days == 0

    # Находим транзакцию ручного закрытия
    txs = await repo.get_transactions(db_session, first_period.id)
    closure_tx = next(tx for tx in txs if tx.transaction_type in ("partial_close", "manual_close"))

    # Отменяем транзакцию
    period_id_after_cancel = await repo.delete_manual_closure_transaction(db_session, closure_tx.id)
    assert period_id_after_cancel == first_period.id

    # Перечитываем период
    restored = await vacation_period_service.get_employee_periods(db_session, employee.id)
    restored_period = next(p for p in restored if p.period_id == first_period.id)
    assert restored_period.remaining_days == 24
    assert restored_period.used_days == 0

    # Добавляем отпуск 8 дней
    order = await create_order(employee=employee, order_number="103")
    await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 10),
        days_count=8,
        vacation_year=2024,
    )
    await repo.add_used_days(db_session, first_period.id, 8, order.id, order.order_number)

    final = await vacation_period_service.get_employee_periods(db_session, employee.id)
    final_period = next(p for p in final if p.period_id == first_period.id)
    assert final_period.used_days_auto == 8
    assert final_period.remaining_days == 16


async def test_future_period_overdraft_becomes_current_balance(
    db_session,
    create_employee,
    create_order,
    create_vacation,
):
    """Тест перехода периодов: будущий → текущий → прошлый.

    Сотрудник принят 01.01.2024. Периоды:
    - 1-й: 01.01.2024 — 31.12.2024 (24 дня)
    - 2-й: 01.01.2025 — 31.12.2025 (24 дня)
    - 3-й: 01.01.2026 — 31.12.2026 (24 дня)

    Сценарий:
    1. На дату 15.03.2024: 3-й период — будущий, в нём отпуск 8 дней → remaining = -8 (перерасход)
    2. На дату 15.06.2026: 3-й период — текущий (6 месяцев прошло) → display_total=12, remaining=4
    3. На дату 15.01.2027: 3-й период — прошлый → display_total=24, remaining=16
    """
    from freezegun import freeze_time

    employee = await create_employee(
        hire_date=date(2024, 1, 1),
        additional_vacation_days=0,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    repo = VacationPeriodRepository()
    orm_periods = await repo.get_by_employee(db_session, employee.id)
    third_period = next(p for p in orm_periods if p.year_number == 3)

    # Создаём отпуск в 3-м периоде (8 дней)
    order = await create_order(employee=employee, order_number="200")
    await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 10),
        days_count=8,
        vacation_year=2026,
    )
    await repo.add_used_days(db_session, third_period.id, 8, order.id, order.order_number)

    # === ШАГ 1: Дата 15.03.2024 — 3-й период ещё БУДУЩИЙ ===
    with freeze_time("2024-03-15"):
        future_periods = await vacation_period_service.get_employee_periods(db_session, employee.id)
        future_period = next(p for p in future_periods if p.period_id == third_period.id)

        # Будущий период: display_total=0, remaining = 0 - 8 = -8 (перерасход)
        assert future_period.total_days == 0, f"Future display_total should be 0, got {future_period.total_days}"
        assert future_period.used_days == 8
        assert future_period.used_days_auto == 8
        assert future_period.remaining_days == -8, f"Future remaining should be -8, got {future_period.remaining_days}"

    # === ШАГ 2: Дата 15.06.2026 — 3-й период ТЕКУЩИЙ (6 месяцев прошло) ===
    with freeze_time("2026-06-15"):
        current_periods = await vacation_period_service.get_employee_periods(db_session, employee.id)
        current_period = next(p for p in current_periods if p.period_id == third_period.id)

        # Текущий период: display_total = 24 / 12 * 6 = 12
        # remaining = display_total - used_days_auto = 12 - 8 = 4
        assert current_period.total_days == 12, f"Current display_total should be 12, got {current_period.total_days}"
        assert current_period.used_days == 8
        assert current_period.used_days_auto == 8
        assert current_period.remaining_days == 4, f"Current remaining should be 4, got {current_period.remaining_days}"

    # === ШАГ 3: Дата 15.01.2027 — 3-й период ПРОШЛЫЙ ===
    with freeze_time("2027-01-15"):
        past_periods = await vacation_period_service.get_employee_periods(db_session, employee.id)
        past_period = next(p for p in past_periods if p.period_id == third_period.id)

        # Прошлый период: display_total = 24 (полный), remaining = 24 - 8 = 16
        assert past_period.total_days == 24, f"Past display_total should be 24, got {past_period.total_days}"
        assert past_period.used_days == 8
        assert past_period.used_days_auto == 8
        assert past_period.remaining_days == 16, f"Past remaining should be 16, got {past_period.remaining_days}"


async def test_future_period_with_partial_close_and_date_transition(
    db_session,
    create_employee,
    create_order,
    create_vacation,
):
    """Тест: частичное закрытие будущего периода и переход через даты.

    Период частично закрыт (remaining=10) → отпуск 8 дней в будущем →
    проверка что при переходе в текущий display_total accrues, но remaining сохраняется.
    """
    from freezegun import freeze_time

    employee = await create_employee(
        hire_date=date(2024, 1, 1),
        additional_vacation_days=0,
    )

    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days,
    )

    repo = VacationPeriodRepository()
    orm_periods = await repo.get_by_employee(db_session, employee.id)
    second_period = next(p for p in orm_periods if p.year_number == 2)  # 2025

    # Частично закрываем 2-й период (оставляем 10 дней)
    await vacation_period_service.partial_close_period(
        db_session,
        second_period.id,
        remaining_days=10,
    )

    # Создаём отпуск во 2-м периоде (8 дней)
    order = await create_order(employee=employee, order_number="201")
    await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2025, 7, 1),
        end_date=date(2025, 7, 10),
        days_count=8,
        vacation_year=2025,
    )
    await repo.add_used_days(db_session, second_period.id, 8, order.id, order.order_number)

    # === ШАГ 1: Дата 15.03.2024 — 2-й период БУДУЩИЙ ===
    with freeze_time("2024-03-15"):
        future_periods = await vacation_period_service.get_employee_periods(db_session, employee.id)
        future_period = next(p for p in future_periods if p.period_id == second_period.id)

        # Будущий: display_total=0, remaining = 0 - used_days = -22 (перерасход)
        # Игнорируем явно установленный remaining_days — период еще не начался
        assert future_period.total_days == 0
        assert future_period.used_days_auto == 8
        assert future_period.used_days_manual == 14
        assert future_period.used_days == 22
        assert future_period.remaining_days == -22, f"Expected -22, got {future_period.remaining_days}"

    # === ШАГ 2: Дата 15.06.2025 — 2-й период ТЕКУЩИЙ (6 месяцев) ===
    with freeze_time("2025-06-15"):
        current_periods = await vacation_period_service.get_employee_periods(db_session, employee.id)
        current_period = next(p for p in current_periods if p.period_id == second_period.id)

        # Текущий: display_total = 24/12*6 = 12
        # В карточке текущего периода показываем "актуально на сегодня":
        # remaining = display_total - used_days = 12 - 22 = -10
        assert current_period.total_days == 12
        assert current_period.remaining_days == -10, f"Expected -10, got {current_period.remaining_days}"

    # === ШАГ 3: Дата 15.01.2026 — 2-й период ПРОШЛЫЙ ===
    with freeze_time("2026-01-15"):
        past_periods = await vacation_period_service.get_employee_periods(db_session, employee.id)
        past_period = next(p for p in past_periods if p.period_id == second_period.id)

        # Прошлый: display_total = 24, remaining = 2 (явно установлен)
        assert past_period.total_days == 24
        assert past_period.remaining_days == 2, f"Expected 2, got {past_period.remaining_days}"
