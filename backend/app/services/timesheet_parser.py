"""Парсер турникетного Excel-журнала (workedjournal)."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class ParsedEmployee:
    """Сотрудник, найденный в файле (ещё не сопоставлен с БД)."""

    last_name: Optional[str] = None
    first_name: Optional[str] = None
    patronymic: Optional[str] = None
    tab_number: Optional[str] = None
    department_name: Optional[str] = None
    position_name: Optional[str] = None
    schedule_name: Optional[str] = None
    total_presence: Optional[str] = None
    total_work: Optional[str] = None
    total_night: Optional[str] = None
    days: Dict[date, "ParsedDay"] = field(default_factory=dict)


@dataclass
class ParsedDay:
    """Один день из файла."""

    work_date: date
    presence_hours: Optional[float] = None
    work_hours: Optional[float] = None
    absence_hours: Optional[float] = None
    debt_hours: Optional[float] = None
    night_hours: Optional[float] = None
    overtime_hours: Optional[float] = None
    # Сырые значения из Excel (до парсинга) для аудита данных
    raw: Optional["RawDayValues"] = None


@dataclass
class RawDayValues:
    """Сырые строковые значения ячеек одного дня (как в исходном Excel)."""

    presence: Optional[str] = None
    work: Optional[str] = None
    absence: Optional[str] = None
    debt: Optional[str] = None
    night: Optional[str] = None
    overtime: Optional[str] = None


@dataclass
class ParsedFile:
    """Результат парсинга одного файла."""

    file_title: Optional[str] = None
    department_name: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    employees: List[ParsedEmployee] = field(default_factory=list)


# Заголовки колонок (по индексу 0-based):
# 0 - Фамилия / дата дня
# 1 - Имя
# 2 - Отчество
# 3 - Табельный номер
# 4 - Должность
# 5 - Подразделение
# 6 - Присутствие (часы)
# 7 - Рабочее время (часы)
# 8 - Отсутствие (часы)
# 9 - Задолженность
# 10 - Непогашаемая задолженность
# 11 - Работа в ночное время
# 12 - Переработка
# 13 - Баланс отработанного времени
# 14 - Оправдательные документы
# 15 - Документы без добавления времени / Сверхурочные
# 16 - График работы


DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
HOURS_RE = re.compile(r"^(\d{1,3}):(\d{2})$")


def _parse_hours(value: Any) -> Optional[float]:
    """Парсит строку вида '08:42' или число в часы (float)."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return None
    # Формат HH:MM
    m = HOURS_RE.match(s)
    if m:
        h, mm = int(m.group(1)), int(m.group(2))
        return round(h + mm / 60.0, 4)
    # Попробуем как число
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def _raw_string(value: Any) -> Optional[str]:
    """Возвращает строковое представление ячейки как в исходном Excel (None для пустых)."""
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _is_date_string(value: Any) -> Optional[date]:
    """Если строка начинается с YYYY-MM-DD, возвращает date, иначе None."""
    if not isinstance(value, str):
        return None
    m = DATE_RE.match(value.strip())
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _normalize_employee_name(name: str) -> str:
    """Нормализует ФИО: убирает лишние пробелы, приводит к нижнему регистру."""
    if not name:
        return ""
    return " ".join(name.split()).strip().lower()


def _is_employee_row(row: List[Any], header_row_index: int) -> bool:
    """Эвристика: это строка-сотрудник (не день)?"""
    if not row or not row[0]:
        return False
    first_cell = str(row[0]).strip()
    # Строка-дни начинается с YYYY-MM-DD
    if _is_date_string(first_cell):
        return False
    # Сотрудник имеет Фамилию (русские буквы или латиница с пробелом)
    if len(first_cell) < 2:
        return False
    return True


def _row_looks_like_day_row(row: List[Any]) -> bool:
    """Строка с дневной записью сотрудника?"""
    return _is_date_string(row[0]) is not None


def _find_header_row(data: List[List[Any]]) -> int:
    """Ищет строку-заголовок с колонкой 'Фамилия' (или похожей)."""
    for i, row in enumerate(data[:20]):
        for cell in row:
            if cell and isinstance(cell, str):
                s = cell.strip().lower()
                if s.startswith("фамилия") or s == "сотрудник" or "табельный номер" in s:
                    return i
    # fallback: 4-я строка (0-indexed: 3), как в реальном файле
    return 3


def _extract_period_range(data: List[List[Any]]) -> Tuple[Optional[date], Optional[date]]:
    """Ищет в первых строках вида 'YYYY-MM-DD - YYYY-MM-DD'."""
    for row in data[:6]:
        for cell in row:
            if not cell or not isinstance(cell, str):
                continue
            s = cell.strip()
            m = re.match(r"^(\d{4}-\d{2}-\d{2})\s*[-—]\s*(\d{4}-\d{2}-\d{2})", s)
            if m:
                try:
                    start = date.fromisoformat(m.group(1))
                    end = date.fromisoformat(m.group(2))
                    return start, end
                except ValueError:
                    continue
    return None, None


def _read_workbook(content: bytes) -> List[List[Any]]:
    """Читает первый лист Excel через python-calamine."""
    try:
        from python_calamine import CalamineWorkbook
    except ImportError as e:
        raise RuntimeError(
            "python-calamine не установлен. Установите: pip install python-calamine"
        ) from e
    wb = CalamineWorkbook.from_filelike(BytesIO(content))
    if not wb.sheet_names:
        return []
    sheet = wb.get_sheet_by_index(0)
    return [list(row) for row in sheet.to_python()]


def parse_workedjournal(content: bytes) -> ParsedFile:
    """Парсит содержимое турникетного Excel-файла.

    Возвращает структуру ParsedFile со списком распознанных сотрудников и дней.
    Не выбрасывает исключений при частично нераспознанных данных — такие
    сотрудники просто попадают в employees, и далее на этапе сопоставления
    будет принято решение, что с ними делать.
    """
    data = _read_workbook(content)
    if not data:
        raise ValueError("Файл пуст или не удалось прочитать данные")

    result = ParsedFile()

    # Title (row 0), Department (row 1), Period (row 2)
    if len(data) > 0 and data[0] and data[0][0]:
        result.file_title = str(data[0][0]).strip()
    if len(data) > 1 and data[1] and data[1][0]:
        dept_raw = str(data[1][0]).strip()
        m = re.search(r"['\"]([^'\"]+)['\"]", dept_raw)
        result.department_name = m.group(1) if m else dept_raw
    ps, pe = _extract_period_range(data)
    if ps:
        result.period_start = ps
    if pe:
        result.period_end = pe

    header_row_index = _find_header_row(data)
    # Парсим данные, начиная со строки ПОСЛЕ шапки колонок
    current_emp: Optional[ParsedEmployee] = None
    for i in range(header_row_index + 1, len(data)):
        row = data[i]
        if not row or all(c is None or c == "" for c in row):
            current_emp = None
            continue

        first_cell = row[0] if row else None
        if first_cell is None or (isinstance(first_cell, str) and not first_cell.strip()):
            # Пустая строка — разделитель блоков
            current_emp = None
            continue

        # Строка-дни для текущего сотрудника
        day_date = _is_date_string(first_cell)
        if day_date is not None:
            if current_emp is None:
                # День без сотрудника — пропускаем
                continue
            presence = _parse_hours(row[6]) if len(row) > 6 else None
            work = _parse_hours(row[7]) if len(row) > 7 else None
            absence = _parse_hours(row[8]) if len(row) > 8 else None
            debt = _parse_hours(row[9]) if len(row) > 9 else None
            night = _parse_hours(row[11]) if len(row) > 11 else None
            overtime = _parse_hours(row[12]) if len(row) > 12 else None
            current_emp.days[day_date] = ParsedDay(
                work_date=day_date,
                presence_hours=presence,
                work_hours=work,
                absence_hours=absence,
                debt_hours=debt,
                night_hours=night,
                overtime_hours=overtime,
                raw=RawDayValues(
                    presence=_raw_string(row[6]) if len(row) > 6 else None,
                    work=_raw_string(row[7]) if len(row) > 7 else None,
                    absence=_raw_string(row[8]) if len(row) > 8 else None,
                    debt=_raw_string(row[9]) if len(row) > 9 else None,
                    night=_raw_string(row[11]) if len(row) > 11 else None,
                    overtime=_raw_string(row[12]) if len(row) > 12 else None,
                ),
            )
            # Обновляем диапазон дат
            if result.period_start is None or day_date < result.period_start:
                result.period_start = day_date
            if result.period_end is None or day_date > result.period_end:
                result.period_end = day_date
            continue

        # Строка-сотрудник
        if _is_employee_row(row, header_row_index):
            # Извлекаем ФИО: могут быть в одной ячейке "Иванов Иван Иванович" или
            # в трёх отдельных ячейках.
            first_str = str(first_cell).strip()
            parts = first_str.split()
            emp = ParsedEmployee()
            if len(parts) >= 3:
                emp.last_name, emp.first_name, emp.patronymic = parts[0], parts[1], " ".join(parts[2:])
            elif len(parts) == 2:
                emp.last_name, emp.first_name = parts[0], parts[1]
            else:
                emp.last_name = first_str
            # Если есть отдельные колонки
            if len(row) > 1 and row[1] and not emp.first_name:
                emp.first_name = str(row[1]).strip() or None
            if len(row) > 2 and row[2] and not emp.patronymic:
                emp.patronymic = str(row[2]).strip() or None
            # Табельный номер
            if len(row) > 3 and row[3] not in (None, ""):
                emp.tab_number = str(row[3]).strip()
            # Должность
            if len(row) > 4 and row[4]:
                emp.position_name = str(row[4]).strip() or None
            # Подразделение
            if len(row) > 5 and row[5]:
                emp.department_name = str(row[5]).strip() or None
            # График работы
            if len(row) > 16 and row[16]:
                emp.schedule_name = str(row[16]).strip() or None
            # Итоги по сотруднику
            emp.total_presence = str(row[6]).strip() if len(row) > 6 and row[6] else None
            emp.total_work = str(row[7]).strip() if len(row) > 7 and row[7] else None
            emp.total_night = str(row[11]).strip() if len(row) > 11 and row[11] else None

            result.employees.append(emp)
            current_emp = emp
        else:
            # Не распознано — завершаем текущего сотрудника
            current_emp = None

    return result
