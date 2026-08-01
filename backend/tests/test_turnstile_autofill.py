"""Тесты автозаполнения ручного слоя по турникету (#16)."""
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models.timesheet import TimesheetImport, TimesheetEntry
from app.models.work_schedule import WorkSchedule, WorkScheduleEntry
from app.services.timesheet_service import timesheet_import_service
from app.services.work_schedule_service import work_schedule_service


pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _add_fact(db_session, employee_id: int, work_date: date, presence: float, night: float = 0.0):
    imp = TimesheetImport(
        file_name="autofill.xlsx",
        period_start=work_date,
        period_end=work_date,
        status="completed",
        uploaded_by="tester",
    )
    db_session.add(imp)
    await db_session.flush()
    db_session.add(
        TimesheetEntry(
            import_id=imp.id,
            employee_id=employee_id,
            work_date=work_date,
            presence_hours=presence,
            work_hours=presence,
            night_hours=night,
        )
    )
    await db_session.flush()


async def test_hours_to_shift_mapping():
    f = timesheet_import_service.fact_hours_to_shift_code
    assert f(12, 8) == ("night", None)
    assert f(12, 0) == ("day_long", None)
    assert f(8, 0) == ("day", None)
    assert f(4, 0) == ("day", 4)
    assert f(None, 0) == (None, None)
    assert f(0, 0) == (None, None)


async def test_autofill_fills_manual_layer(db_session, create_employee):
    emp = await create_employee(name="Турникет", hire_date=date(2024, 1, 1))
    d1 = date(2026, 7, 1)
    await _add_fact(db_session, emp.id, d1, 8)

    result = await timesheet_import_service.apply_turnstile_autofill(
        db_session, d1, date(2026, 7, 3), "tester", employee_ids=[emp.id]
    )

    assert result["applied"] == 1
    assert result["skipped_no_pass"] == 2  # 2 июля и 3 июля без прохода

    entry = await work_schedule_service.get_schedule_by_employee_period(
        db_session, emp.id, 2026, 7, with_entries=True
    )
    assert entry is not None
    assert entry.entries[0].shift_type_code == "day"


async def test_autofill_does_not_overwrite_manual(db_session, create_employee):
    """Ячейка с уже заполненным ручным слоем не перетирается (#16)."""
    emp = await create_employee(name="Турникет", hire_date=date(2024, 1, 1))
    d1 = date(2026, 7, 1)
    await _add_fact(db_session, emp.id, d1, 8)

    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2026, 7, "t")
    await work_schedule_service.set_entry(
        db_session, schedule.id, d1, shift_type_code="vacation"
    )

    result = await timesheet_import_service.apply_turnstile_autofill(
        db_session, d1, d1, "tester", employee_ids=[emp.id]
    )

    assert result["applied"] == 0
    assert result["skipped_manual"] == 1

    entry = await work_schedule_service.get_schedule_by_employee_period(
        db_session, emp.id, 2026, 7, with_entries=True
    )
    assert entry.entries[0].shift_type_code == "vacation"


async def test_autofill_night_shift(db_session, create_employee):
    emp = await create_employee(name="Ночник", hire_date=date(2024, 1, 1))
    d1 = date(2026, 7, 1)
    await _add_fact(db_session, emp.id, d1, 12, night=8)

    result = await timesheet_import_service.apply_turnstile_autofill(
        db_session, d1, d1, "tester", employee_ids=[emp.id]
    )
    assert result["applied"] == 1

    entry = await work_schedule_service.get_schedule_by_employee_period(
        db_session, emp.id, 2026, 7, with_entries=True
    )
    assert entry.entries[0].shift_type_code == "night"


async def test_autofill_dry_run_writes_nothing(db_session, create_employee):
    emp = await create_employee(name="Драйран", hire_date=date(2024, 1, 1))
    d1 = date(2026, 7, 1)
    await _add_fact(db_session, emp.id, d1, 8)

    result = await timesheet_import_service.apply_turnstile_autofill(
        db_session, d1, d1, "tester", employee_ids=[emp.id], dry_run=True
    )
    assert result["applied"] == 1
    assert result["dry_run"] is True

    schedules = await work_schedule_service.list_by_period(db_session, 2026, 7)
    assert schedules == []
