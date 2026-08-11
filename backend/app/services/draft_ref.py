"""Typed value object черновика: DraftKind + DraftRef (ADR-0008, #93).

`DraftRef(kind, id)` — application-level typed ссылка на черновик любого вида
(приказ/уведомление/заявление). Фабрики `order/notification/statement`
фиксируют kind, чтобы нельзя было перепутать виды.

`parse_draft_ref` / `serialize_draft_ref` — presentation-boundary хелперы:
строковый wire-format («notification:123», «statement:123», голый uuid для
приказа) разбирается/сериализуется только на границе HTTP. Внутренний код
работает с `DraftRef`, а не со строками.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class DraftKind(Enum):
    ORDER = "order"
    NOTIFICATION = "notification"
    STATEMENT = "statement"


@dataclass(frozen=True)
class DraftRef:
    kind: DraftKind
    # Для order — uuid-строка; для БД-видов — числовой id в строковом виде.
    id: str

    @classmethod
    def order(cls, draft_id: str) -> "DraftRef":
        """Ссылка на файловый черновик приказа по uuid-строке."""
        return cls(kind=DraftKind.ORDER, id=str(draft_id))

    @classmethod
    def notification(cls, notification_id: int) -> "DraftRef":
        """Ссылка на черновик уведомления по числовому id."""
        return cls(kind=DraftKind.NOTIFICATION, id=str(notification_id))

    @classmethod
    def statement(cls, statement_id: int) -> "DraftRef":
        """Ссылка на черновик заявления по числовому id."""
        return cls(kind=DraftKind.STATEMENT, id=str(statement_id))


def parse_draft_ref(raw: str) -> DraftRef:
    """Разобрать строковый draft_id: «notification:N»/«statement:N»/uuid → order.

    Только presentation boundary (HTTP). Голый uuid (и любая строка без
    префикса вида) трактуется как черновик приказа — wire-формат #58.
    """
    if raw.startswith("notification:"):
        return DraftRef.notification(int(raw.split(":", 1)[1]))
    if raw.startswith("statement:"):
        return DraftRef.statement(int(raw.split(":", 1)[1]))
    return DraftRef.order(raw)


def serialize_draft_ref(ref: DraftRef) -> str:
    """Сериализовать DraftRef в строковый wire-format (только presentation boundary).

    Воспроизводит текущие строки: «notification:{id}», «statement:{id}»,
    для приказа — голый uuid. Внешний формат не меняется (#93).
    """
    if ref.kind is DraftKind.NOTIFICATION:
        return f"notification:{ref.id}"
    if ref.kind is DraftKind.STATEMENT:
        return f"statement:{ref.id}"
    return ref.id
