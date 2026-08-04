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


async def test_approve_does_not_block_set_entry(db_session, create_employee):
    """Утверждение не блокирует правку записей."""
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    await work_schedule_service.approve_schedule(db_session, schedule.id, "boss")

    refreshed = await work_schedule_service.get_schedule(db_session, schedule.id, with_entries=False)
    assert refreshed is not None
    assert refreshed.is_approved is True
    assert refreshed.approved_by == "boss"

    # Правка записи в утверждённом графике разрешена
    result = await work_schedule_service.set_entry(
        db_session, schedule.id, date(2025, 7, 1), shift_type_code="day"
    )
    assert result is not None
    assert result.shift_type_code == "day"


async def test_approve_does_not_block_bulk_set(db_session, create_employee):
    """Пакетная запись в утверждённый график разрешена."""
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    await work_schedule_service.approve_schedule(db_session, schedule.id, "boss")

    entries = await work_schedule_service.bulk_set_entries(
        db_session,
        schedule.id,
        [
            {"work_date": date(2025, 7, 1), "shift_type_code": "day", "planned_hours_override": 8.0},
            {"work_date": date(2025, 7, 2), "shift_type_code": "off", "planned_hours_override": None},
        ],
    )
    assert len(entries) == 2
    assert entries[0].shift_type_code == "day"
    assert entries[1].shift_type_code == "off"


async def test_approve_does_not_block_delete_entry(db_session, create_employee):
    """Удаление записи в утверждённом графике разрешено."""
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    entry = await work_schedule_service.set_entry(
        db_session, schedule.id, date(2025, 7, 1), shift_type_code="day"
    )
    await work_schedule_service.approve_schedule(db_session, schedule.id, "boss")

    # Удаление записи разрешено
    await work_schedule_service.delete_entry(db_session, entry.id)
    refreshed = await work_schedule_service.get_schedule(db_session, schedule.id, with_entries=True)
    assert refreshed is not None
    assert len(refreshed.entries) == 0


async def test_approve_does_not_block_update_comment(db_session, create_employee):
    """Обновление комментария утверждённого графика разрешено."""
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    await work_schedule_service.approve_schedule(db_session, schedule.id, "boss")

    updated = await work_schedule_service.update_schedule(
        db_session, schedule.id, {"comment": "Исправлено после утверждения"}
    )
    assert updated.comment == "Исправлено после утверждения"


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


async def test_delete_approved_schedule_blocked(db_session, create_employee):
    emp = await create_employee(name="Test", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    await work_schedule_service.approve_schedule(db_session, schedule.id, "boss")
    with pytest.raises(PermissionError):
        await work_schedule_service.delete_schedule(db_session, schedule.id)


# --- partial_bulk_set: массовое заполнение выделения (тикет #22) ---


async def test_partial_bulk_multiple_employees(db_session, create_employee):
    """Массовая запись для нескольких сотрудников одним запросом."""
    emp1 = await create_employee(name="Emp1", tab_number=1, hire_date=date(2024, 1, 1))
    emp2 = await create_employee(name="Emp2", tab_number=2, hire_date=date(2024, 1, 1))

    result = await work_schedule_service.partial_bulk_set(
        db_session,
        [
            {"employee_id": emp1.id, "work_date": date(2025, 7, 1), "shift_type_code": "day", "planned_hours_override": None},
            {"employee_id": emp1.id, "work_date": date(2025, 7, 2), "shift_type_code": "day", "planned_hours_override": None},
            {"employee_id": emp2.id, "work_date": date(2025, 7, 1), "shift_type_code": "night", "planned_hours_override": None},
        ],
        "tester",
    )
    assert result["success_count"] == 3
    assert result["error_count"] == 0
    assert len(result["results"]) == 3
    assert all(r["success"] for r in result["results"])

    # Графики созданы для обоих сотрудников
    s1 = await work_schedule_service.get_schedule_by_employee_period(db_session, emp1.id, 2025, 7)
    s2 = await work_schedule_service.get_schedule_by_employee_period(db_session, emp2.id, 2025, 7)
    assert s1 is not None
    assert s2 is not None

    # Записи на месте
    e1 = await work_schedule_service.repo.get_entry_by_date(db_session, s1.id, date(2025, 7, 1))
    assert e1 is not None and e1.shift_type_code == "day"
    e2 = await work_schedule_service.repo.get_entry_by_date(db_session, s2.id, date(2025, 7, 1))
    assert e2 is not None and e2.shift_type_code == "night"


async def test_partial_bulk_cross_month(db_session, create_employee):
    """Выделение через границу месяца попадает в оба графика."""
    emp = await create_employee(name="Emp", tab_number=1, hire_date=date(2024, 1, 1))

    result = await work_schedule_service.partial_bulk_set(
        db_session,
        [
            {"employee_id": emp.id, "work_date": date(2025, 7, 30), "shift_type_code": "day", "planned_hours_override": None},
            {"employee_id": emp.id, "work_date": date(2025, 7, 31), "shift_type_code": "day", "planned_hours_override": None},
            {"employee_id": emp.id, "work_date": date(2025, 8, 1), "shift_type_code": "day", "planned_hours_override": None},
            {"employee_id": emp.id, "work_date": date(2025, 8, 2), "shift_type_code": "day", "planned_hours_override": None},
        ],
        "tester",
    )
    assert result["success_count"] == 4
    assert result["error_count"] == 0

    # Созданы два графика: июль и август
    s_july = await work_schedule_service.get_schedule_by_employee_period(db_session, emp.id, 2025, 7)
    s_aug = await work_schedule_service.get_schedule_by_employee_period(db_session, emp.id, 2025, 8)
    assert s_july is not None
    assert s_aug is not None
    assert s_july.id != s_aug.id

    # Записи распределены по графикам по дате
    july = await work_schedule_service.get_schedule(db_session, s_july.id, with_entries=True)
    aug = await work_schedule_service.get_schedule(db_session, s_aug.id, with_entries=True)
    assert july is not None
    assert aug is not None
    assert len(july.entries) == 2
    assert len(aug.entries) == 2


async def test_partial_bulk_partial_failure(db_session, create_employee):
    """Частичный отказ: неверный код смены не откатывает успешные строки."""
    emp = await create_employee(name="Emp", tab_number=1, hire_date=date(2024, 1, 1))

    result = await work_schedule_service.partial_bulk_set(
        db_session,
        [
            {"employee_id": emp.id, "work_date": date(2025, 7, 1), "shift_type_code": "day", "planned_hours_override": None},
            {"employee_id": emp.id, "work_date": date(2025, 7, 2), "shift_type_code": "no_such_code", "planned_hours_override": None},
            {"employee_id": emp.id, "work_date": date(2025, 7, 3), "shift_type_code": "night", "planned_hours_override": None},
        ],
        "tester",
    )
    assert result["success_count"] == 2
    assert result["error_count"] == 1

    by_date = {r["work_date"]: r for r in result["results"]}
    assert by_date[date(2025, 7, 1)]["success"] is True
    assert by_date[date(2025, 7, 2)]["success"] is False
    assert by_date[date(2025, 7, 2)]["error"]
    assert by_date[date(2025, 7, 3)]["success"] is True

    # Успешные строки сохранены, ошибочная — нет
    schedule = await work_schedule_service.get_schedule_by_employee_period(db_session, emp.id, 2025, 7)
    assert schedule is not None
    e1 = await work_schedule_service.repo.get_entry_by_date(db_session, schedule.id, date(2025, 7, 1))
    e2 = await work_schedule_service.repo.get_entry_by_date(db_session, schedule.id, date(2025, 7, 2))
    e3 = await work_schedule_service.repo.get_entry_by_date(db_session, schedule.id, date(2025, 7, 3))
    assert e1 is not None and e1.shift_type_code == "day"
    assert e2 is None  # ошибочная запись не создана
    assert e3 is not None and e3.shift_type_code == "night"


async def test_partial_bulk_creates_schedule(db_session, create_employee):
    """Массовая запись создаёт график сотруднику на месяц, если его ещё нет."""
    emp = await create_employee(name="Emp", tab_number=1, hire_date=date(2024, 1, 1))

    # Графика ещё нет
    assert await work_schedule_service.get_schedule_by_employee_period(db_session, emp.id, 2025, 7) is None

    result = await work_schedule_service.partial_bulk_set(
        db_session,
        [{"employee_id": emp.id, "work_date": date(2025, 7, 15), "shift_type_code": "off", "planned_hours_override": None}],
        "tester",
    )
    assert result["success_count"] == 1
    assert result["error_count"] == 0

    schedule = await work_schedule_service.get_schedule_by_employee_period(db_session, emp.id, 2025, 7)
    assert schedule is not None
    assert schedule.created_by == "tester"
    entry = await work_schedule_service.repo.get_entry_by_date(db_session, schedule.id, date(2025, 7, 15))
    assert entry is not None and entry.shift_type_code == "off"


async def test_partial_bulk_reset_to_auto(db_session, create_employee):
    """Сброс (shift_type_code=None) перезаписывает ручное значение пустой сменой."""
    emp = await create_employee(name="Emp", tab_number=1, hire_date=date(2024, 1, 1))
    schedule = await work_schedule_service.create_schedule(db_session, emp.id, 2025, 7, "t")
    await work_schedule_service.set_entry(db_session, schedule.id, date(2025, 7, 1), shift_type_code="day")

    result = await work_schedule_service.partial_bulk_set(
        db_session,
        [{"employee_id": emp.id, "work_date": date(2025, 7, 1), "shift_type_code": None, "planned_hours_override": None}],
        "tester",
    )
    assert result["success_count"] == 1

    entry = await work_schedule_service.repo.get_entry_by_date(db_session, schedule.id, date(2025, 7, 1))
    assert entry is not None
    assert entry.shift_type_code is None
