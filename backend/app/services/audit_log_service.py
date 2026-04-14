"""Сервис для чтения общего журнала аудита."""
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.config import settings, BASE_DIR

LOG_DIR = BASE_DIR / "logs"
LOG_FILE = LOG_DIR / "hrms.log"

# Паттерн для парсинга логов аудита — ловит любую строку hrms.audit | ...: message
AUDIT_PATTERN = re.compile(
    r"(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \| (?P<level>\w+)\s+\| hrms\.audit \| "
    r"(?P<action>.+?):\s*(?P<message>.+)"
)

ACTION_MAP = {
    "EMPLOYEE CREATED": "created",
    "EMPLOYEE UPDATED": "updated",
    "EMPLOYEE ARCHIVED": "archived",
    "EMPLOYEE RESTORED": "restored",
    "EMPLOYEE SOFT DELETED": "deleted",
    "EMPLOYEE HARD DELETED": "hard_deleted",
    "VACATION CREATED": "vacation_created",
    "VACATION UPDATED": "vacation_updated",
    "VACATION DELETED": "vacation_deleted",
    "ORDER CREATED": "order_created",
    "ORDER DELETED": "order_deleted",
    "IMPORT EMPLOYEES": "import",
    "DEPARTMENT CREATED": "department_created",
    "DEPARTMENT UPDATED": "department_updated",
    "DEPARTMENT DELETED": "department_deleted",
    "POSITION CREATED": "position_created",
    "POSITION UPDATED": "position_updated",
    "POSITION DELETED": "position_deleted",
}


def parse_log_line(line: str) -> Optional[dict]:
    """Распарсить строку лога в структурированный формат."""
    match = AUDIT_PATTERN.search(line)
    if not match:
        return None

    data = match.groupdict()
    raw_action = data["action"].strip()

    # Маппинг действий — ищем по частичному совпадению
    action_value = raw_action.lower()
    for key, value in ACTION_MAP.items():
        if key.lower() in action_value:
            data["action"] = value
            break
    else:
        data["action"] = action_value

    # Извлечь employee_id и name из сообщения
    msg = data["message"]
    employee_id = None
    employee_name = None

    id_match = re.search(r"id=(\d+)", msg)
    if id_match:
        employee_id = int(id_match.group(1))

    name_match = re.search(r"name=([^,\s]+)", msg)
    if name_match:
        employee_name = name_match.group(1)

    data["employee_id"] = employee_id
    data["employee_name"] = employee_name

    return data


def _extract_date_from_line(line: str) -> Optional[str]:
    """Извлечь дату YYYY-MM-DD из строки лога."""
    match = re.match(r"(\d{4}-\d{2}-\d{2})", line)
    return match.group(1) if match else None


def read_audit_logs(
    limit: int = 100,
    offset: int = 0,
    action: Optional[str] = None,
    employee_name: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> dict:
    """Прочитать логи аудита из файла.

    Returns:
        dict с keys: items, total
    """
    if not LOG_FILE.exists():
        return {"items": [], "total": 0}

    # Читаем с конца файла (новые записи сверху)
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Фильтруем только строки аудита (hrms.audit содержит все действия)
    audit_lines = [line for line in lines if "hrms.audit" in line]

    # Применяем фильтры
    if action:
        audit_lines = [line for line in audit_lines if action.upper() in line.upper()]

    if employee_name:
        audit_lines = [line for line in audit_lines if employee_name.lower() in line.lower()]

    # Фильтр по диапазону дат (формат YYYY-MM-DD)
    if date_from or date_to:
        filtered = []
        for line in audit_lines:
            log_date = _extract_date_from_line(line)
            if not log_date:
                continue
            if date_from and log_date < date_from:
                continue
            if date_to and log_date > date_to:
                continue
            filtered.append(line)
        audit_lines = filtered

    total = len(audit_lines)

    # Берём последние N записей (reverse order)
    audit_lines.reverse()
    selected_lines = audit_lines[offset : offset + limit]

    # Парсим строки
    items = []
    for line in selected_lines:
        parsed = parse_log_line(line)
        if parsed:
            items.append(parsed)

    return {"items": items, "total": total}
