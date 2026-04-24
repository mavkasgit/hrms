from datetime import date

import pytest
from sqlalchemy import select

from app.models.vacation_period import VacationPeriod
from app.schemas.employee import EmployeeCreate
from app.services.employee_service import employee_service


pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_employee_import_creates_vacation_periods(
    db_session,
    create_department,
    create_position,
):
    department = await create_department(name="IT Department")
    position = await create_position(name="Developer")

    employee = await employee_service.create_employee(
        db_session,
        EmployeeCreate(
            name="Alice Example",
            tab_number=1001,
            department_id=department.id,
            position_id=position.id,
            hire_date=date(2023, 3, 1),
            birth_date=date(1990, 5, 15),
            gender="M",
            additional_vacation_days=5,
            citizenship=True,
            residency=True,
            pensioner=False,
            payment_form="card",
            rate=1.0,
        ),
        "test_user",
    )

    periods = list(
        (
            await db_session.execute(
                select(VacationPeriod)
                .where(VacationPeriod.employee_id == employee.id)
                .order_by(VacationPeriod.year_number)
            )
        ).scalars().all()
    )

    assert employee.hire_date == date(2023, 3, 1)
    assert len(periods) >= 1

    first_period = periods[0]
    assert first_period.year_number == 1
    assert first_period.period_start == date(2023, 3, 1)
    assert first_period.main_days == 24
    assert first_period.additional_days == 5
    assert first_period.used_days == 0
