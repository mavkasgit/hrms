"""Сборка data-массива полей документа для конфига OnlyOffice.

OnlyOffice умеет предзаполнять поля формы (content controls) документа
массивом `document.data` вида [{"key": ..., "value": ...}], где key — тег
поля, а value — его значение.

Этот модуль — единственное место, где данные черновика/документа
превращаются в такой массив: поля не передаются по коду списком и логика
сборки не размазана по роутерам. Здесь же живёт модель DraftFormData —
ответ кнопки «Заполнить поля» (пересоздание документа).
"""
from typing import Any

from pydantic import BaseModel, Field


class DraftFormData(BaseModel):
    """Данные черновика для повторного заполнения формы создания документа.

    Скалярные поля приходят массивом `data` ([{"key": …, "value": …}, …]).
    `employees` — структурированный список сотрудников группового приказа.
    """
    kind: str
    is_group: bool = False
    order_type_code: str | None = None
    data: list[dict[str, str]] = Field(default_factory=list)
    employees: list[dict[str, Any]] | None = None


def build_form_data(fields: dict[str, Any] | None) -> list[dict[str, str]]:
    """Собрать [{"key": k, "value": v}, ...] из словаря полей документа.

    None и пустые строки пропускаются; составные значения (list/dict)
    отбрасываются — OnlyOffice предзаполняет только скалярные текстовые
    поля. Значения приводятся к строке.
    """
    if not fields:
        return []
    data: list[dict[str, str]] = []
    for key, value in fields.items():
        if value is None or value == "":
            continue
        if isinstance(value, (list, dict)):
            continue
        data.append({"key": key, "value": str(value)})
    return data


def order_form_data(order: Any) -> list[dict[str, str]]:
    """Данные приказа из БД для предзаполнения документа в OnlyOffice."""
    fields: dict[str, Any] = {
        "number": order.order_number,
        "date": order.order_date.isoformat() if order.order_date else None,
    }
    fields.update(dict(order.extra_fields or {}))
    return build_form_data(fields)


def notification_form_data(notification: Any) -> list[dict[str, str]]:
    """Данные уведомления: конфиг OnlyOffice и кнопка «Заполнить поля»."""
    fields: dict[str, Any] = {
        "employee_id": notification.employee_id,
        "notification_type_id": notification.notification_type_id,
        "number": notification.number,
        "date": notification.date.isoformat() if notification.date else None,
    }
    fields.update(dict(notification.extra_fields or {}))
    return build_form_data(fields)


def statement_form_data(statement: Any) -> list[dict[str, str]]:
    """Данные заявления: конфиг OnlyOffice и кнопка «Заполнить поля»."""
    fields: dict[str, Any] = {
        "employee_id": statement.employee_id,
        "statement_type_id": statement.statement_type_id,
        "number": statement.number,
        "date": statement.date.isoformat() if statement.date else None,
    }
    fields.update(dict(statement.extra_fields or {}))
    return build_form_data(fields)


def draft_form_data(meta: dict[str, Any]) -> list[dict[str, str]]:
    """Данные файлового черновика приказа (метаданные)."""
    payload = meta.get("payload") or {}
    fields: dict[str, Any] = {
        "employee_id": payload.get("employee_id"),
        "order_type_id": payload.get("order_type_id"),
        "number": payload.get("order_number"),
        "date": payload.get("order_date"),
    }
    fields.update(dict(payload.get("extra_fields") or {}))
    if meta.get("kind") == "group_order":
        for key in ("vacation_start", "mode", "call_date", "call_date_start", "call_date_end"):
            fields[key] = payload.get(key)
    return build_form_data(fields)
