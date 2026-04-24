from datetime import date

import pytest
from dateutil.relativedelta import relativedelta

from app.repositories.vacation_repository import VacationRepository


pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_check_overlap_returns_existing_vacation_for_same_employee(
    db_session,
    create_employee,
    create_vacation,
):
    employee = await create_employee()
    existing = await create_vacation(
        employee=employee,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 10),
        vacation_type="integration-overlap",
    )

    repo = VacationRepository()
    overlapping = await repo.check_overlap(
        db_session,
        employee.id,
        start_date=date(2026, 4, 10),
        end_date=date(2026, 4, 20),
    )

    assert overlapping is not None
    assert overlapping.id == existing.id


async def test_check_overlap_ignores_deleted_records_and_excluded_id(
    db_session,
    create_employee,
    create_vacation,
):
    employee = await create_employee()
    deleted_vacation = await create_vacation(
        employee=employee,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 10),
        vacation_type="integration-overlap",
        is_deleted=True,
    )
    active_vacation = await create_vacation(
        employee=employee,
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 10),
        vacation_type="integration-overlap",
    )

    repo = VacationRepository()

    ignored_deleted = await repo.check_overlap(
        db_session,
        employee.id,
        start_date=date(2026, 4, 5),
        end_date=date(2026, 4, 7),
    )
    ignored_self = await repo.check_overlap(
        db_session,
        employee.id,
        start_date=date(2026, 5, 2),
        end_date=date(2026, 5, 4),
        exclude_id=active_vacation.id,
    )

    assert deleted_vacation.is_deleted is True
    assert ignored_deleted is None
    assert ignored_self is None


async def test_get_used_days_counts_only_days_inside_requested_year(
    db_session,
    create_employee,
    create_vacation,
):
    employee = await create_employee()
    vacation_type = "integration-used-days"

    await create_vacation(
        employee=employee,
        start_date=date(2025, 12, 28),
        end_date=date(2026, 1, 5),
        days_count=9,
        vacation_year=2025,
        vacation_type=vacation_type,
    )
    await create_vacation(
        employee=employee,
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 3),
        days_count=3,
        vacation_year=2026,
        vacation_type=vacation_type,
    )
    await create_vacation(
        employee=employee,
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 2),
        days_count=2,
        vacation_year=2026,
        vacation_type=vacation_type,
        is_cancelled=True,
    )
    await create_vacation(
        employee=employee,
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 2),
        days_count=2,
        vacation_year=2026,
        vacation_type=vacation_type,
        is_deleted=True,
    )

    repo = VacationRepository()
    used_days = await repo.get_used_days(db_session, employee.id, 2026, vacation_type=vacation_type)

    assert used_days == 8


async def test_get_vacation_balance_returns_zero_for_missing_employee(db_session):
    repo = VacationRepository()

    balance = await repo.get_vacation_balance(db_session, employee_id=999999)

    assert balance == {
        "available_days": 0,
        "used_days": 0,
        "remaining_days": 0,
        "vacation_type_breakdown": {},
    }


async def test_get_vacation_balance_uses_closed_periods_and_type_breakdown(
    db_session,
    create_employee,
    create_vacation,
    create_vacation_period,
):
    employee = await create_employee(hire_date=date(2023, 1, 15))

    await create_vacation_period(
        employee=employee,
        period_start=date(2023, 1, 15),
        period_end=date(2024, 1, 14),
        main_days=24,
        additional_days=5,
        used_days=29,
        used_days_auto=10,
        used_days_manual=19,
        remaining_days=0,
        year_number=1,
    )
    await create_vacation_period(
        employee=employee,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=14,
        used_days_auto=8,
        used_days_manual=6,
        remaining_days=10,
        year_number=2,
    )

    await create_vacation(
        employee=employee,
        start_date=date(2024, 6, 1),
        end_date=date(2024, 6, 10),
        days_count=10,
        vacation_year=2024,
        vacation_type="integration-work",
    )
    await create_vacation(
        employee=employee,
        start_date=date(2024, 8, 15),
        end_date=date(2024, 8, 18),
        days_count=4,
        vacation_year=2024,
        vacation_type="integration-extra",
    )
    await create_vacation(
        employee=employee,
        start_date=date(2024, 9, 1),
        end_date=date(2024, 9, 2),
        days_count=2,
        vacation_year=2024,
        vacation_type="integration-deleted",
        is_deleted=True,
    )

    repo = VacationRepository()
    balance = await repo.get_vacation_balance(db_session, employee.id)

    assert balance["available_days"] == 53
    assert balance["used_days"] == 43
    assert balance["remaining_days"] == 10
    assert balance["vacation_type_breakdown"] == {
        "integration-work": 10,
        "integration-extra": 4,
    }


async def test_get_vacation_balance_accrues_open_current_period(
    db_session,
    create_employee,
    create_vacation,
    create_vacation_period,
):
    today = date.today()
    period_start = date(today.year, 1, 1)
    period_end = period_start + relativedelta(years=1) - relativedelta(days=1)
    vacation_type = "integration-accrual"

    employee = await create_employee(hire_date=period_start)
    await create_vacation_period(
        employee=employee,
        period_start=period_start,
        period_end=period_end,
        main_days=24,
        additional_days=0,
        used_days=0,
        remaining_days=None,
        year_number=1,
    )
    await create_vacation(
        employee=employee,
        start_date=period_start + relativedelta(months=1),
        end_date=period_start + relativedelta(months=1, days=2),
        days_count=3,
        vacation_year=today.year,
        vacation_type=vacation_type,
    )

    months_passed = relativedelta(today, period_start).years * 12 + relativedelta(today, period_start).months
    if relativedelta(today, period_start).days > 0:
        months_passed += 1
    expected_available = round(24 / 12 * months_passed)

    repo = VacationRepository()
    balance = await repo.get_vacation_balance(db_session, employee.id)

    assert balance["available_days"] == expected_available
    assert balance["used_days"] == 3
    assert balance["remaining_days"] == expected_available - 3
    assert balance["vacation_type_breakdown"] == {vacation_type: 3}


async def test_get_employee_vacation_history_splits_cross_year_vacation_and_attaches_order_number(
    db_session,
    create_employee,
    create_order,
    create_vacation,
):
    today = date.today()
    current_year = today.year
    previous_year = current_year - 1

    employee = await create_employee(hire_date=date(previous_year, 1, 15))
    order = await create_order(
        employee=employee,
        order_number="42",
        order_date=date(current_year, 1, 5),
    )
    await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(previous_year, 12, 28),
        end_date=date(current_year, 1, 5),
        days_count=9,
        vacation_year=previous_year,
        vacation_type="integration-history",
    )

    repo = VacationRepository()
    history = await repo.get_employee_vacation_history(db_session, employee.id)

    current_year_entry = next(item for item in history["years"] if item["year"] == current_year)
    previous_year_entry = next(item for item in history["years"] if item["year"] == previous_year)

    assert history["employee_id"] == employee.id
    assert history["hire_date"] == str(employee.hire_date)
    assert current_year_entry["used_days"] == 5
    assert current_year_entry["vacations"][0]["days_count"] == 5
    assert current_year_entry["vacations"][0]["order_number"] == "42"
    assert previous_year_entry["used_days"] == 4
