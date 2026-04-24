from datetime import date

import pytest
from sqlalchemy import select

from app.models.vacation_period import VacationPeriod
from app.models.employee import Employee, EmployeeAuditLog
from app.schemas.employee import EmployeeCreate, EmployeeUpdate
from app.services.employee_service import employee_service


pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_update_employee_hire_date_resets_vacation_periods(
    db_session,
    create_department,
    create_position,
):
    department = await create_department(name="IT")
    position = await create_position(name="Dev")

    # Создаём сотрудника с hire_date = 2023-01-15
    employee = await employee_service.create_employee(
        db_session,
        EmployeeCreate(
            name="Test Employee",
            tab_number=1001,
            department_id=department.id,
            position_id=position.id,
            hire_date=date(2023, 1, 15),
            birth_date=date(1990, 5, 15),
            gender="M",
            citizenship=True,
            residency=True,
            pensioner=False,
            payment_form="card",
            rate=1.0,
        ),
        "test_user",
    )

    # Убеждаемся, что периоды созданы
    periods_before = list(
        (
            await db_session.execute(
                select(VacationPeriod)
                .where(VacationPeriod.employee_id == employee.id)
                .order_by(VacationPeriod.year_number)
            )
        ).scalars().all()
    )
    assert len(periods_before) >= 1
    first_period_before = periods_before[0]
    assert first_period_before.period_start == date(2023, 1, 15)
    assert first_period_before.year_number == 1

    # Меняем hire_date на 2023-03-01
    updated = await employee_service.update_employee(
        db_session,
        employee.id,
        EmployeeUpdate(hire_date=date(2023, 3, 1)),
        "test_user",
    )
    assert updated.hire_date == date(2023, 3, 1)

    # Проверяем, что старые периоды удалены и созданы новые
    periods_after = list(
        (
            await db_session.execute(
                select(VacationPeriod)
                .where(VacationPeriod.employee_id == employee.id)
                .order_by(VacationPeriod.year_number)
            )
        ).scalars().all()
    )
    assert len(periods_after) >= 1
    first_period_after = periods_after[0]
    assert first_period_after.period_start == date(2023, 3, 1)
    assert first_period_after.year_number == 1
    assert first_period_after.used_days == 0
    assert first_period_after.used_days_auto == 0
    assert first_period_after.used_days_manual == 0
    assert first_period_after.remaining_days is None

    # Проверяем audit log
    audit_logs = list(
        (
            await db_session.execute(
                select(EmployeeAuditLog)
                .where(
                    EmployeeAuditLog.employee_id == employee.id,
                    EmployeeAuditLog.action == "periods_reset",
                )
            )
        ).scalars().all()
    )
    assert len(audit_logs) == 1
    assert "periods_reset" in audit_logs[0].action


async def test_update_employee_additional_days_without_hire_date_change(
    db_session,
    create_department,
    create_position,
):
    department = await create_department(name="HR")
    position = await create_position(name="Manager")

    employee = await employee_service.create_employee(
        db_session,
        EmployeeCreate(
            name="Second Employee",
            tab_number=1002,
            department_id=department.id,
            position_id=position.id,
            hire_date=date(2024, 1, 15),
            birth_date=date(1992, 8, 20),
            gender="F",
            additional_vacation_days=5,
            citizenship=True,
            residency=True,
            pensioner=False,
            payment_form="card",
            rate=1.0,
        ),
        "test_user",
    )

    periods_before = list(
        (
            await db_session.execute(
                select(VacationPeriod)
                .where(VacationPeriod.employee_id == employee.id)
            )
        ).scalars().all()
    )
    assert len(periods_before) >= 1
    assert periods_before[0].additional_days == 5

    # Меняем только additional_vacation_days, hire_date не трогаем
    updated = await employee_service.update_employee(
        db_session,
        employee.id,
        EmployeeUpdate(additional_vacation_days=10),
        "test_user",
    )
    assert updated.additional_vacation_days == 10

    periods_after = list(
        (
            await db_session.execute(
                select(VacationPeriod)
                .where(VacationPeriod.employee_id == employee.id)
            )
        ).scalars().all()
    )
    # Периоды НЕ должны быть удалены — только обновлено additional_days
    assert len(periods_after) == len(periods_before)
    assert periods_after[0].additional_days == 10


async def test_update_employee_same_hire_date_does_not_reset(
    db_session,
    create_department,
    create_position,
):
    department = await create_department(name="Sales")
    position = await create_position(name="Rep")

    employee = await employee_service.create_employee(
        db_session,
        EmployeeCreate(
            name="Third Employee",
            tab_number=1003,
            department_id=department.id,
            position_id=position.id,
            hire_date=date(2024, 6, 1),
            birth_date=date(1995, 1, 1),
            gender="M",
            citizenship=True,
            residency=True,
            pensioner=False,
            payment_form="cash",
            rate=0.5,
        ),
        "test_user",
    )

    periods_before = list(
        (
            await db_session.execute(
                select(VacationPeriod)
                .where(VacationPeriod.employee_id == employee.id)
            )
        ).scalars().all()
    )
    count_before = len(periods_before)

    # Отправляем тот же hire_date (симуляция frontend, который шлёт все поля)
    updated = await employee_service.update_employee(
        db_session,
        employee.id,
        EmployeeUpdate(hire_date=date(2024, 6, 1), name="Third Employee Updated"),
        "test_user",
    )
    assert updated.name == "Third Employee Updated"
    assert updated.hire_date == date(2024, 6, 1)

    periods_after = list(
        (
            await db_session.execute(
                select(VacationPeriod)
                .where(VacationPeriod.employee_id == employee.id)
            )
        ).scalars().all()
    )
    # Периоды НЕ должны быть удалены, т.к. hire_date не изменилась
    assert len(periods_after) == count_before
