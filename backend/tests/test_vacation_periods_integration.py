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


async def test_partial_close_can_restore_fully_closed_period(db_session, create_employee):
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

    await vacation_period_service.close_period(db_session, first_period.period_id)
    restored = await vacation_period_service.partial_close_period(
        db_session,
        first_period.period_id,
        remaining_days=27,
    )

    assert restored.total_days == 27
    assert restored.used_days == 0
    assert restored.used_days_manual == 0
    assert restored.remaining_days == 27


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
