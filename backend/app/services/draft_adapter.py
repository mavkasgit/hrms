"""Draft adapters, registry and application facade (ADR-0008, #93).

T2 — application-level каркас lifecycle-модуля черновиков без смены поведения:

- `DraftAdapter` (Protocol) — общий контракт вида черновика (commit/delete_draft);
- `OrderDraftAdapter` / `NotificationDraftAdapter` / `StatementDraftAdapter` —
  тонкие обёртки над существующими сервисами;
- `DraftAdapterRegistry` — mapping kind → adapter;
- `DraftApplicationFacade` — единая точка входа для list/commit/delete_draft.

Логика per-kind роутов перенесена сюда; роутеры onlyoffice стали тонкими и
вызывают facade через typed `DraftRef`. Authz (T6) и идемпотентность UNIQUE
(T4/T5) здесь НЕ реализуются. Delete-guard (T8, #98) — «delete_draft удаляет
только is_draft=True, документ → 409» — реализован в
`DocumentDraftService.delete`, адаптеры БД-видов полагаются на него.
"""
from __future__ import annotations

import logging
from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import HRMSException
from app.models.notification import Notification
from app.models.statement import Statement
from app.services.document_draft_service import (
    notification_draft_service,
    statement_draft_service,
)
from app.services.draft_ref import DraftKind, DraftRef
from app.services.order_draft_service import order_draft_service
from app.services.order_service import order_service
from app.services.unified_drafts_service import unified_drafts_service

logger = logging.getLogger(__name__)


class DraftAdapter(Protocol):
    """Протокол адаптера вида черновика: facade вызывает, адаптеры реализуют."""

    kind: DraftKind

    async def commit(self, db: AsyncSession, actor: str, ref: DraftRef) -> Any:
        """Зафиксировать черновик. Возвращает то, что раньше отдавал роут."""
        ...

    async def delete_draft(self, db: AsyncSession, actor: str, ref: DraftRef) -> None:
        """Удалить черновик."""
        ...


class OrderDraftAdapter:
    """Файловые черновики приказов (single + group, оба — kind ORDER)."""

    kind = DraftKind.ORDER

    async def commit(self, db: AsyncSession, actor: str, ref: DraftRef) -> Any:
        """Зафиксировать приказ из файлового черновика (#30).

        Логика перенесена из роутов commit_order_draft/commit_group_order_draft:
        claim → create_single/group → serialize, включая 409-duplicate-ветку
        single-commit. Диспатч single/group — по метаданным черновика.
        """
        draft_id = ref.id
        # Atomic claim prevents double-create when UI sends commit twice (postMessage+BC race).
        try:
            order_draft_service.claim_draft_for_commit(draft_id)
        except HRMSException as exc:
            if exc.status_code == 409:
                # Duplicate commit: draft already committed — return success silently (#30 AC5)
                return {"message": "Приказ уже создан", "duplicate": True}
            raise

        try:
            metadata = self._read_metadata_for_dispatch(draft_id)
            is_group = bool(metadata and metadata.get("kind") == "group_order")
            if is_group:
                order = await order_service.create_group_order_from_draft(db=db, draft_id=draft_id)
            else:
                order = await order_service.create_single_order_from_draft(db, draft_id)
        except Exception:
            # Release lock so the draft remains available for retry (#30 AC4, #88)
            order_draft_service.release_commit_lock(draft_id)
            raise

        if is_group:
            try:
                await order_draft_service.delete_file_only(draft_id)
            except Exception:
                logger.exception("Failed to delete committed group draft %s", draft_id)

        return order_service._serialize_order(order)

    @staticmethod
    def _read_metadata_for_dispatch(draft_id: str) -> dict[str, Any] | None:
        """Прочитать метаданные для диспатча single/group.

        Отсутствие метаданных трактуется как single: дальше
        `create_single_order_from_draft` сам поднимет штатный 409 draft_outdated
        (групповой черновик всегда пишет метаданные, поэтому его диспатч не
        «промахивается» мимо метаданных).
        """
        try:
            return order_draft_service.read_draft_metadata(draft_id)
        except HRMSException as exc:
            if exc.status_code == 404:
                return None
            raise

    async def delete_draft(self, db: AsyncSession, actor: str, ref: DraftRef) -> None:
        """Только файловая чистка приказа (DB-строки до commit нет)."""
        await order_draft_service.delete_file_only(ref.id)


class NotificationDraftAdapter:
    """Черновики уведомлений (БД, is_draft)."""

    kind = DraftKind.NOTIFICATION

    async def commit(self, db: AsyncSession, actor: str, ref: DraftRef) -> Any:
        await notification_draft_service.commit(db, int(ref.id))
        return {"message": "ok"}

    async def delete_draft(self, db: AsyncSession, actor: str, ref: DraftRef) -> None:
        """Удалить черновик уведомления. Guard #98: документ (is_draft=False) → 409."""
        record = await db.get(Notification, int(ref.id))
        if record is None:
            raise HRMSException("Уведомление не найдено", "notification_not_found", status_code=404)
        await notification_draft_service.delete(db, record)


class StatementDraftAdapter:
    """Черновики заявлений (БД, is_draft)."""

    kind = DraftKind.STATEMENT

    async def commit(self, db: AsyncSession, actor: str, ref: DraftRef) -> Any:
        await statement_draft_service.commit(db, int(ref.id))
        return {"message": "ok"}

    async def delete_draft(self, db: AsyncSession, actor: str, ref: DraftRef) -> None:
        """Удалить черновик заявления. Guard #98: документ (is_draft=False) → 409."""
        record = await db.get(Statement, int(ref.id))
        if record is None:
            raise HRMSException("Заявление не найдено", "statement_not_found", status_code=404)
        await statement_draft_service.delete(db, record)


class DraftAdapterRegistry:
    """Mapping kind → adapter. Не знает про бизнес-логику, только регистрация."""

    def __init__(self) -> None:
        self._adapters: dict[DraftKind, DraftAdapter] = {}

    def register(self, adapter: DraftAdapter) -> None:
        self._adapters[adapter.kind] = adapter

    def resolve(self, kind: DraftKind) -> DraftAdapter:
        try:
            return self._adapters[kind]
        except KeyError:
            raise HRMSException("Неизвестный вид черновика", "unknown_draft_kind", status_code=400) from None


class DraftApplicationFacade:
    """Application-level вход lifecycle-модуля: list/commit/delete_draft.

    Общий протокол поверх per-kind адаптеров. Роутеры вызывают его с typed
    `DraftRef`; диспатч по kind делает facade.
    """

    def __init__(self, registry: DraftAdapterRegistry) -> None:
        self._registry = registry

    async def list(self, db: AsyncSession) -> list[Any]:
        """Все черновики всех видов (приказы + уведомления + заявления)."""
        return await unified_drafts_service.list_all_drafts(db)

    async def commit(self, db: AsyncSession, actor: str, ref: DraftRef) -> Any:
        adapter = self._registry.resolve(ref.kind)
        return await adapter.commit(db, actor, ref)

    async def delete_draft(self, db: AsyncSession, actor: str, ref: DraftRef) -> None:
        adapter = self._registry.resolve(ref.kind)
        await adapter.delete_draft(db, actor, ref)


draft_adapter_registry = DraftAdapterRegistry()
draft_adapter_registry.register(OrderDraftAdapter())
draft_adapter_registry.register(NotificationDraftAdapter())
draft_adapter_registry.register(StatementDraftAdapter())

draft_application_facade = DraftApplicationFacade(draft_adapter_registry)
