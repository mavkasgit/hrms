"""Тесты сервиса планового графика работы."""
from datetime import date

import pytest

from app.models.work_schedule import WorkSchedule, WorkScheduleEntry
from app.services.work_schedule_service import (
    work_schedule_service,
    WorkScheduleAlreadyExistsError,
    WorkScheduleNotFoundError,
)


pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_create_schedule(db_session, create_employee):
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(
        db_session, emp.id, 2025, 7, "tester", comment="Начало"
    )
    assert schedule.id is not None
    assert schedule.year == 2025
    assert schedule.month == 7
    assert schedule.is_approved is False
    assert schedule.created_by == "tester"


async def test_create_duplicate_raises(db_session, create_employee):
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    with pytest.raises(WorkScheduleAlreadyExistsError):
        await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")


async def test_bulk_set_entries(db_session, create_employee):
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")

    entries = await work_schedule_service.bulk_set_entries(
        db_session,
        schedule.id,
        [
            {"work_date": date(2025, 7, 1), "shift_type_code": "day", "planned_hours_override": None, "note": "День"},
            {"work_date": date(2025, 7, 2), "shift_type_code": "day", "planned_hours_override": None},
            {"work_date": date(2025, 7, 3), "shift_type_code": "off", "planned_hours_override": None},
        ],
    )
    assert len(entries) == 3
    assert entries[0].shift_type_code == "day"
    assert entries[2].shift_type_code == "off"


async def test_bulk_set_entries_rejects_unknown_code(db_session, create_employee):
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    with pytest.raises(ValueError):
        await work_schedule_service.bulk_set_entries(
            db_session,
            schedule.id,
            [{"work_date": date(2025, 7, 1), "shift_type_code": "no_such_code"}],
        )


async def test_approve_blocks_edits(db_session, create_employee):
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    await work_schedule_service.approve_schedule(db_session, schedule.id, "boss")

    refreshed = await work_schedule_service.get_schedule(db_session, schedule.id, with_entries=False)
    assert refreshed.is_approved is True
    assert refreshed.approved_by == "boss"

    # Попытка изменить запись должна упасть
    with pytest.raises(PermissionError):
        await work_schedule_service.set_entry(
            db_session, schedule.id, date(2025, 7, 1), shift_type_code=None
        )


async def test_unapprove_unlocks_edits(db_session, create_employee):
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    await work_schedule_service.approve_schedule(db_session, schedule.id, "boss")
    await work_schedule_service.unapprove_schedule(db_session, schedule.id)

    # Теперь редактирование разрешено
    entry = await work_schedule_service.set_entry(
        db_session, schedule.id, date(2025, 7, 1), shift_type_code="day", planned_hours_override=8.0
    )
    assert entry is not None
    assert entry.shift_type_code == "day"


async def test_delete_schedule(db_session, create_employee):
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    await work_schedule_service.delete_schedule(db_session, schedule.id)

    result = await work_schedule_service.get_schedule(db_session, schedule.id, with_entries=False)
    assert result is None
