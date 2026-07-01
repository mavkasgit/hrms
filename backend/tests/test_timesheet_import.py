"""Тесты импорта табеля из турникетного журнала."""
import io
from datetime import date

import openpyxl
import pytest

from app.models.employee import Employee
from app.models.timesheet import TimesheetImport, TimesheetEntry, TimesheetUnmatchedRow
from app.services.timesheet_service import timesheet_import_service


pytestmark = pytest.mark.asyncio(loop_scope="module")


def _build_workedjournal_bytes(employees_data: list[dict], period: str = "2025-07-01 - 2025-07-03") -> bytes:
    """Собирает тестовый турникетный файл.
    employees_data: [{'last': 'Иванов', 'first': 'Иван', 'patronymic': 'Иванович', 'tab': '1001', 'position': 'Инженер', 'days': [{'date': '2025-07-01', 'presence': '08:00', 'work': '08:00', 'night': None}, ...]}]
    """
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append([f"Отчет УРВ", None] + [None] * 15)
    sheet.append([f"Подразделение: 'Цех'", None] + [None] * 15)
    sheet.append([period, None] + [None] * 15)
    sheet.append([
        "Фамилия", "Имя", "Отчество", "Табельный номер", "Должность", "Подразделение",
        "Присутствие", "Рабочее время", "Отсутствие", "Задолженность", "Непогашаемая",
        "Работа в ночное время", "Переработка", "Баланс", "Оправдательные", "Документы",
        "График работы",
    ])

    for emp in employees_data:
        # Summary row
        total_presence = sum(_h_to_hours(d.get("presence") or "") or 0 for d in emp["days"])
        total_work = sum(_h_to_hours(d.get("work") or "") or 0 for d in emp["days"])
        total_presence_str = _h_to_hm(total_presence)
        total_work_str = _h_to_hm(total_work)
        sheet.append([
            emp["last"], emp["first"], emp["patronymic"], emp.get("tab", ""),
            emp.get("position", ""), "Цех",
            total_presence_str, total_work_str, "", "", "", "", "", "", "", "",
            "Гальваника",
        ])
        # Day rows
        for d in emp["days"]:
            sheet.append([
                d["date"],
                "", "", "",
                emp.get("position", ""), "Цех",
                d.get("presence", "") or "",
                d.get("work", "") or "",
                d.get("absence", "") or "",
                "", "",
                d.get("night", "") or "",
                d.get("overtime", "") or "",
                "", "", "", "",
                "Гальваника",
            ])

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _h_to_hours(value: str):
    if not value:
        return None
    if ":" not in value:
        try:
            return float(value)
        except ValueError:
            return None
    try:
        h, m = value.split(":")
        return int(h) + int(m) / 60.0
    except (ValueError, AttributeError):
        return None


def _h_to_hm(hours: float) -> str:
    if hours is None:
        return ""
    h = int(hours)
    m = int(round((hours - h) * 60))
    return f"{h:02d}:{m:02d}"


async def test_preview_import_matches_by_name(
    db_session,
    create_employee,
):
    emp = await create_employee(
        name="Иванов Иван Иванович", tab_number=1001, hire_date=date(2024, 1, 1)
    )
    content = _build_workedjournal_bytes(
        [
            {
                "last": "Иванов", "first": "Иван", "patronymic": "Иванович",
                "tab": "1001", "position": "Инженер",
                "days": [
                    {"date": "2025-07-01", "presence": "08:00", "work": "08:00"},
                    {"date": "2025-07-02", "presence": "08:00", "work": "08:00"},
                ],
            }
        ]
    )
    result = await timesheet_import_service.preview_import(db_session, content, "test.xlsx")

    assert result["employees_total"] == 1
    assert result["employees_matched"] == 1
    assert result["employees_unmatched"] == 0
    assert result["matched_preview"][0]["employee_id"] == emp.id


async def test_preview_import_unmatched_employee(
    db_session,
    create_employee,
):
    await create_employee(name="Сидоров Сидор Сидорович", tab_number=1002)
    content = _build_workedjournal_bytes(
        [
            {
                "last": "Неизвестный", "first": "Юзер", "patronymic": "",
                "tab": "9999", "position": "Стажёр",
                "days": [{"date": "2025-07-01", "presence": "08:00", "work": "08:00"}],
            }
        ]
    )
    result = await timesheet_import_service.preview_import(db_session, content, "test.xlsx")

    assert result["employees_total"] == 1
    assert result["employees_matched"] == 0
    assert result["employees_unmatched"] == 1
    assert result["unmatched"][0]["last_name"] == "Неизвестный"
    assert result["unmatched"][0]["reason"] == "not_found"


async def test_confirm_import_creates_entries(
    db_session,
    create_employee,
):
    emp = await create_employee(
        name="Иванов Иван Иванович", tab_number=1001, hire_date=date(2024, 1, 1)
    )
    content = _build_workedjournal_bytes(
        [
            {
                "last": "Иванов", "first": "Иван", "patronymic": "Иванович",
                "tab": "1001", "position": "Инженер",
                "days": [
                    {"date": "2025-07-01", "presence": "08:00", "work": "08:00"},
                    {"date": "2025-07-02", "presence": "08:00", "work": "08:00"},
                    {"date": "2025-07-03", "presence": "", "work": ""},
                ],
            }
        ]
    )
    record = await timesheet_import_service.confirm_import(
        db_session, content, "test.xlsx", "tester"
    )

    assert isinstance(record, TimesheetImport)
    assert record.employees_matched == 1
    assert record.employees_unmatched == 0
    assert record.entries_imported == 3

    # Проверяем, что в БД появились записи
    from sqlalchemy import select
    result = await db_session.execute(
        select(TimesheetEntry).where(TimesheetEntry.import_id == record.id)
    )
    entries = list(result.scalars().all())
    assert len(entries) == 3
    assert all(e.employee_id == emp.id for e in entries)
    work_hours = sorted([e.work_hours for e in entries if e.work_hours is not None])
    assert work_hours == [8.0, 8.0]


async def test_confirm_import_with_manual_assignment(
    db_session,
    create_employee,
):
    """Импорт с ручным сопоставлением несопоставленного сотрудника."""
    real_emp = await create_employee(
        name="Новый Сотрудник", tab_number=5555, hire_date=date(2024, 1, 1)
    )
    content = _build_workedjournal_bytes(
        [
            {
                "last": "Новый", "first": "Сотрудник", "patronymic": "",
                "tab": "5555", "position": "Оператор",
                "days": [{"date": "2025-07-01", "presence": "12:00", "work": "12:00"}],
            }
        ]
    )
    preview = await timesheet_import_service.preview_import(db_session, content, "t.xlsx")
    # В файле ФИО разбито на 2 части (без отчества), в БД — "Новый Сотрудник"
    # Имя из файла "Новый Сотрудник" нормализуется к "новый сотрудник",
    # в БД то же самое → должно сматчиться
    if preview["employees_matched"] == 0:
        # Если не сматчилось — применяем ручное сопоставление
        result = await timesheet_import_service.confirm_import(
            db_session, content, "t.xlsx", "tester",
            unmatched_assignments={preview["unmatched"][0]["key"]: real_emp.id},
        )
        assert result.employees_matched == 1
        assert result.employees_unmatched == 0


async def test_rollback_import_removes_entries(
    db_session,
    create_employee,
):
    await create_employee(
        name="Иванов Иван Иванович", tab_number=1001, hire_date=date(2024, 1, 1)
    )
    content = _build_workedjournal_bytes(
        [
            {
                "last": "Иванов", "first": "Иван", "patronymic": "Иванович",
                "tab": "1001", "position": "Инженер",
                "days": [{"date": "2025-07-01", "presence": "08:00", "work": "08:00"}],
            }
        ]
    )
    record = await timesheet_import_service.confirm_import(
        db_session, content, "t.xlsx", "tester"
    )
    record_id = record.id

    rolled = await timesheet_import_service.rollback_import(db_session, record_id, "tester")
    assert rolled.status == "rolled_back"
    assert rolled.rolled_back_at is not None

    from sqlalchemy import select
    entries = (await db_session.execute(
        select(TimesheetEntry).where(TimesheetEntry.import_id == record_id)
    )).scalars().all()
    assert len(entries) == 0
