"""Тесты парсера турникетного журнала."""
import io
from datetime import date

import openpyxl
import pytest

from app.services.timesheet_parser import parse_workedjournal


pytestmark = pytest.mark.asyncio(loop_scope="module")


def _build_workedjournal_bytes(title: str = 'Отчет "УРВ"', department: str = "Участок", period: str = "2025-07-01 - 2025-07-03") -> bytes:
    workbook = openpyxl.Workbook()
    sheet = workbook.active

    # Row 1: title
    sheet.append([title, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None])
    # Row 2: department
    sheet.append([f"Подразделение: '{department}'", None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None])
    # Row 3: period
    sheet.append([period, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None])
    # Row 4: headers
    sheet.append([
        "Фамилия", "Имя", "Отчество", "Табельный номер", "Должность", "Подразделение",
        "Присутствие", "Рабочее время", "Отсутствие", "Задолженность", "Непогашаемая задолженность",
        "Работа в ночное время", "Переработка", "Баланс", "Оправдательные", "Документы",
        "График работы",
    ])
    # Row 5: employee summary
    sheet.append(["Иванов", "Иван", "Иванович", "1001", "Инженер", department, "16:00", "16:00", "", "", "", "", "", "", "", "", "Гальваника"])
    # Row 6-8: days
    sheet.append(["2025-07-01 Пн", "", "", "", "Инженер", department, "08:00", "08:00", "", "", "", "", "", "", "", "", "Гальваника"])
    sheet.append(["2025-07-02 Вт", "", "", "", "Инженер", department, "08:00", "08:00", "", "", "", "", "", "", "", "", "Гальваника"])
    sheet.append(["2025-07-03 Ср", "", "", "", "Инженер", department, "", "", "", "", "", "", "", "", "", "", "Гальваника"])

    # Row 9: empty
    sheet.append([None] * 17)
    # Row 10: second employee
    sheet.append(["Петров", "Пётр", "Петрович", "1002", "Техник", department, "24:00", "24:00", "", "", "", "07:00", "", "", "", "", "Гальваника"])
    # Row 11-12
    sheet.append(["2025-07-01 Пн", "", "", "", "Техник", department, "12:00", "12:00", "", "", "", "07:00", "", "", "", "", "Гальваника"])
    sheet.append(["2025-07-02 Вт", "", "", "", "Техник", department, "12:00", "12:00", "", "", "", "", "", "", "", "", "Гальваника"])

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


async def test_parse_workedjournal_basic():
    content = _build_workedjournal_bytes()
    parsed = parse_workedjournal(content)

    assert parsed.department_name == "Участок"
    assert parsed.period_start == date(2025, 7, 1)
    assert parsed.period_end == date(2025, 7, 3)
    assert len(parsed.employees) == 2

    ivanov = parsed.employees[0]
    assert ivanov.last_name == "Иванов"
    assert ivanov.first_name == "Иван"
    assert ivanov.patronymic == "Иванович"
    assert ivanov.tab_number == "1001"
    assert ivanov.position_name == "Инженер"
    assert ivanov.schedule_name == "Гальваника"
    assert len(ivanov.days) == 3
    assert date(2025, 7, 1) in ivanov.days
    assert ivanov.days[date(2025, 7, 1)].work_hours == 8.0
    assert ivanov.days[date(2025, 7, 1)].presence_hours == 8.0
    # пустой день — значения None
    assert ivanov.days[date(2025, 7, 3)].work_hours is None

    petrov = parsed.employees[1]
    assert petrov.last_name == "Петров"
    assert petrov.tab_number == "1002"
    assert len(petrov.days) == 2
    assert petrov.days[date(2025, 7, 1)].night_hours == 7.0
    assert petrov.days[date(2025, 7, 1)].work_hours == 12.0


async def test_parse_workedjournal_handles_garbled_title():
    content = _build_workedjournal_bytes(title="Some Title", department="Цех №1", period="2025-08-01 - 2025-08-05")
    parsed = parse_workedjournal(content)
    assert parsed.department_name == "Цех №1"
    # period_start обновляется на основе реальных дат из файла
    assert parsed.period_start == date(2025, 7, 1)
    # period_end может быть взят из шапки файла, если она есть
    assert parsed.period_end == date(2025, 8, 5)


async def test_parse_workedjournal_empty_file_raises():
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    buffer = io.BytesIO()
    workbook.save(buffer)

    with pytest.raises(ValueError):
        parse_workedjournal(buffer.getvalue())
