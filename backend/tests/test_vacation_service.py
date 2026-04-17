from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from app.core.exceptions import (
    EmployeeNotFoundError,
    InsufficientVacationDaysError,
    VacationOverlapError,
)
from app.repositories.order_repository import order_repository
from app.repositories.vacation_period_repository import VacationPeriodRepository
from app.repositories.vacation_repository import vacation_repository
from app.services.vacation_service import vacation_service


WORK_VACATION_TYPE = "РўСЂСѓРґРѕРІРѕР№"

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


async def test_create_vacation_persists_order_link_and_uses_holiday_adjusted_days(
    db_session,
    create_employee,
    create_order,
):
    employee = await create_employee(contract_start=date(2023, 1, 15))
    created_order = await create_order(
        employee=employee,
        order_number="15",
        order_type="РћС‚РїСѓСЃРє С‚СЂСѓРґРѕРІРѕР№",
        order_date=date(2024, 3, 15),
    )

    with patch(
        "app.services.vacation_service.references_repository.get_holidays_for_year",
        new=AsyncMock(return_value=[date(2024, 4, 3)]),
    ), patch(
        "app.services.vacation_service.vacation_period_service.check_balance_before_create",
        new=AsyncMock(),
    ) as check_balance, patch(
        "app.services.vacation_service.order_service.create_order",
        new=AsyncMock(return_value=created_order),
    ) as create_order, patch(
        "app.services.vacation_service.auto_use_days",
        new=AsyncMock(),
    ) as auto_use_days:
        result = await vacation_service.create_vacation(
            db_session,
            {
                "employee_id": employee.id,
                "start_date": date(2024, 4, 1),
                "end_date": date(2024, 4, 5),
                "vacation_type": WORK_VACATION_TYPE,
                "order_date": date(2024, 3, 15),
                "comment": "integration-create",
            },
            "admin",
        )

    stored_vacation = (await vacation_repository.get_by_employee_id(db_session, employee.id))[0]
    order_payload = create_order.await_args.args[1]

    assert result["days_count"] == 4
    assert result["order_id"] == created_order.id
    assert result["order_number"] == "15"
    assert stored_vacation.order_id == created_order.id
    assert stored_vacation.comment == "integration-create"
    assert check_balance.await_args.args == (db_session, employee.id, 4)
    assert order_payload.order_date == date(2024, 3, 15)
    assert auto_use_days.await_args.args == (db_session, employee.id, 4, created_order.id, "15")


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
        "app.services.vacation_service.order_service.create_order",
        new=AsyncMock(),
    ) as create_order:
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
    assert create_order.await_count == 0


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


async def test_delete_vacation_removes_order_file_and_restores_period_usage(
    db_session,
    create_employee,
    create_order,
    create_vacation,
    create_vacation_period,
    tmp_path,
):
    employee = await create_employee(contract_start=date(2024, 1, 15))
    order_file = tmp_path / "order-to-delete.docx"
    order_file.write_text("order file")

    order = await create_order(
        employee=employee,
        order_number="42",
        order_type="РћС‚РїСѓСЃРє С‚СЂСѓРґРѕРІРѕР№",
        order_date=date(2024, 3, 15),
        file_path=str(order_file),
    )
    vacation = await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2024, 4, 1),
        end_date=date(2024, 4, 5),
        days_count=5,
        vacation_year=2024,
        vacation_type=WORK_VACATION_TYPE,
    )
    period = await create_vacation_period(
        employee=employee,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        used_days=5,
        used_days_auto=5,
        order_ids=str(order.id),
        order_numbers=order.order_number,
        order_days_map=f'{{"{order.id}": 5}}',
        year_number=1,
    )

    result = await vacation_service.delete_vacation(db_session, vacation.id, "admin")

    period_repo = VacationPeriodRepository()
    restored_period = await period_repo.get_by_id(db_session, period.id)
    deleted_vacation = await vacation_repository.get_by_id(db_session, vacation.id)
    deleted_order = await order_repository.get_by_id(db_session, order.id, include_deleted=True)

    assert result is True
    assert restored_period is not None
    assert restored_period.used_days == 0
    assert restored_period.used_days_auto == 0
    assert restored_period.order_ids is None
    assert restored_period.order_days_map is None
    assert deleted_vacation is None
    assert deleted_order is None
    assert not order_file.exists()


async def test_cancel_vacation_marks_vacation_and_order_as_cancelled(
    db_session,
    create_employee,
    create_order,
    create_vacation,
):
    employee = await create_employee()
    order = await create_order(
        employee=employee,
        order_number="88",
        order_type="РћС‚РїСѓСЃРє С‚СЂСѓРґРѕРІРѕР№",
        order_date=date(2024, 6, 1),
    )
    vacation = await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2024, 6, 10),
        end_date=date(2024, 6, 14),
        days_count=5,
        vacation_year=2024,
        vacation_type=WORK_VACATION_TYPE,
    )

    result = await vacation_service.cancel_vacation(db_session, vacation.id, "admin")

    cancelled_vacation = await vacation_repository.get_by_id(db_session, vacation.id)
    cancelled_order = await order_repository.get_by_id(db_session, order.id)

    assert result is True
    assert cancelled_vacation is not None
    assert cancelled_vacation.is_cancelled is True
    assert cancelled_vacation.cancelled_by == "admin"
    assert cancelled_order is not None
    assert cancelled_order.is_cancelled is True
    assert cancelled_order.cancelled_by == "admin"
