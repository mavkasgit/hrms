from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from app.core.exceptions import (
    EmployeeNotFoundError,
    InsufficientVacationDaysError,
    VacationOverlapError,
)
from app.repositories.vacation_period_repository import VacationPeriodRepository
from app.repositories.vacation_repository import vacation_repository
from app.services.vacation_period_service import vacation_period_service
from app.services.vacation_service import vacation_service

WORK_VACATION_TYPE = "Трудовой"

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_create_vacation_raises_for_missing_employee(db_session):
    with pytest.raises(EmployeeNotFoundError):
        await vacation_service.create_vacation(
            db_session,
            {
                "employee_id": 999999,
                "start_date": date(2024, 4, 1),
                "end_date": date(2024, 4, 5),
                "vacation_type": WORK_VACATION_TYPE,
            },
            "admin",
        )


async def test_create_vacation_rejects_overlap_against_existing_record(
    db_session,
    create_employee,
    create_vacation,
):
    employee = await create_employee()
    await create_vacation(
        employee=employee,
        start_date=date(2024, 4, 5),
        end_date=date(2024, 4, 10),
        vacation_type=WORK_VACATION_TYPE,
    )

    with pytest.raises(VacationOverlapError):
        await vacation_service.create_vacation(
            db_session,
            {
                "employee_id": employee.id,
                "start_date": date(2024, 4, 1),
                "end_date": date(2024, 4, 7),
                "vacation_type": WORK_VACATION_TYPE,
            },
            "admin",
        )


async def test_create_vacation_uses_holiday_adjusted_days_and_auto_use(
    db_session,
    create_employee,
):
    employee = await create_employee(hire_date=date(2023, 1, 15))

    with patch(
        "app.services.vacation_service.references_repository.get_holidays_for_year",
        new=AsyncMock(return_value=[date(2024, 4, 3)]),
    ), patch("app.services.vacation_service.auto_use_days", new=AsyncMock()) as auto_use_days:
        result = await vacation_service.create_vacation(
            db_session,
            {
                "employee_id": employee.id,
                "start_date": date(2024, 4, 1),
                "end_date": date(2024, 4, 5),
                "vacation_type": WORK_VACATION_TYPE,
                "comment": "integration-create",
            },
            "admin",
        )

    stored_vacation = (await vacation_repository.get_by_employee_id(db_session, employee.id))[0]
    assert stored_vacation.order_id is not None

    assert result["days_count"] == 4
    assert stored_vacation.comment == "integration-create"
    assert result["order_id"] == stored_vacation.order_id
    assert result["order_number"] is not None
    assert auto_use_days.await_args.args == (
        db_session, employee.id, 4,
        employee.hire_date, employee.additional_vacation_days or 0,
        stored_vacation.order_id, result["order_number"],
    )


async def test_create_vacation_fails_when_holidays_consume_entire_range(
    db_session,
    create_employee,
):
    employee = await create_employee()

    with patch(
        "app.services.vacation_service.references_repository.get_holidays_for_year",
        new=AsyncMock(return_value=[date(2024, 1, 1), date(2024, 1, 2)]),
    ), patch(
        "app.services.vacation_service.vacation_period_service.check_balance_before_create",
        new=AsyncMock(),
    ) as check_balance, patch(
        "app.services.vacation_service.auto_use_days",
        new=AsyncMock(),
    ) as auto_use_days:
        with pytest.raises(InsufficientVacationDaysError):
            await vacation_service.create_vacation(
                db_session,
                {
                    "employee_id": employee.id,
                    "start_date": date(2024, 1, 1),
                    "end_date": date(2024, 1, 2),
                    "vacation_type": WORK_VACATION_TYPE,
                },
                "admin",
            )

    assert check_balance.await_count == 0
    assert auto_use_days.await_count == 0


async def test_update_vacation_recalculates_days_and_comment(
    db_session,
    create_employee,
    create_vacation,
):
    employee = await create_employee()
    vacation = await create_vacation(
        employee=employee,
        start_date=date(2024, 5, 1),
        end_date=date(2024, 5, 5),
        days_count=5,
        vacation_year=2024,
        vacation_type=WORK_VACATION_TYPE,
        comment="before-update",
    )

    with patch(
        "app.services.vacation_service.references_repository.get_holidays_for_year",
        new=AsyncMock(return_value=[date(2024, 5, 2)]),
    ):
        result = await vacation_service.update_vacation(
            db_session,
            vacation.id,
            {
                "end_date": date(2024, 5, 6),
                "comment": "after-update",
            },
            "admin",
        )

    updated = await vacation_repository.get_by_id(db_session, vacation.id)

    assert result["days_count"] == 5
    assert updated is not None
    assert updated.end_date == date(2024, 5, 6)
    assert updated.days_count == 5
    assert updated.comment == "after-update"


async def test_delete_vacation_restores_period_usage(
    db_session,
    create_employee,
    create_vacation,
    create_vacation_period,
):
    employee = await create_employee(hire_date=date(2024, 1, 15))
    vacation = await create_vacation(
        employee=employee,
        start_date=date(2024, 4, 1),
        end_date=date(2024, 4, 5),
        days_count=5,
        vacation_year=2024,
        vacation_type=WORK_VACATION_TYPE,
    )
    await create_vacation_period(
        employee=employee,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        used_days=5,
        used_days_auto=5,
        year_number=1,
    )

    result = await vacation_service.delete_vacation(db_session, vacation.id, "admin")

    deleted_vacation = await vacation_repository.get_by_id(db_session, vacation.id)
    periods = await vacation_period_service.get_employee_periods(db_session, employee.id)

    assert result is True
    assert deleted_vacation is None
    # После recalculate_periods периоды пересозданы, баланс восстановлен
    assert len(periods) > 0
    total_used = sum(p.used_days for p in periods)
    assert total_used == 0


async def test_cancel_vacation_marks_vacation_as_cancelled(
    db_session,
    create_employee,
    create_vacation,
):
    employee = await create_employee()
    vacation = await create_vacation(
        employee=employee,
        start_date=date(2024, 6, 10),
        end_date=date(2024, 6, 14),
        days_count=5,
        vacation_year=2024,
        vacation_type=WORK_VACATION_TYPE,
    )

    result = await vacation_service.cancel_vacation(db_session, vacation.id, "admin")
    cancelled_vacation = await vacation_repository.get_by_id(db_session, vacation.id)

    assert result is True
    assert cancelled_vacation is not None
    assert cancelled_vacation.is_cancelled is True
    assert cancelled_vacation.cancelled_by == "admin"
