"""Единая статус-машина OnlyOffice-колбэков (ADR-0006).

Модуль владеет lifecycle попытки сохранения (request_forcesave +
handle_callback): нормализует статусы OnlyOffice один раз и делегирует
per-kind strategy. Производственные адаптеры — onlyoffice_service
(download/force_save) и onlyoffice_save_tracker.
"""

import logging
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol, cast

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import HRMSException
from app.core.paths import notifications_path, statements_path, storage_path
from app.models.notification import Notification
from app.models.statement import Statement
from app.services.document_draft_service import notification_draft_service, statement_draft_service
from app.services.onlyoffice_save_tracker import onlyoffice_save_tracker
from app.services.onlyoffice_service import onlyoffice_service
from app.services.order_draft_service import order_draft_service
from app.services.order_service import order_service

logger = logging.getLogger(__name__)


class CallbackKind(StrEnum):
    ORDER = "order"
    ORDER_DRAFT = "order-draft"
    NOTIFICATION = "notification"
    STATEMENT = "statement"
    TEMPLATE = "template"


@dataclass(frozen=True)
class CallbackContext:
    kind: CallbackKind
    entity_id: str | int
    db: AsyncSession | None
    userdata: str | None = None


@dataclass(frozen=True)
class Target:
    path: Path


class PhysicalOutcome(StrEnum):
    PERSISTED = "persisted"
    FAILED = "failed"
    IGNORE = "ignore"


@dataclass(frozen=True)
class CallbackOutcome:
    kind: PhysicalOutcome
    url: str | None = None
    oo_status: int | None = None
    error: str | None = None


@dataclass(frozen=True)
class CallbackResult:
    physical: PhysicalOutcome
    http_error: int  # 0 | 1
    error: str | None = None  # сообщение для маппинга/лога


class DocumentDownloader(Protocol):
    async def download_and_replace(self, url: str, target: Path) -> None: ...


class OnlyOfficeCommandClient(Protocol):
    async def force_save(self, document_key: str, userdata: str | None = None) -> int | None: ...


class PersistenceStrategy(Protocol):
    async def resolve_target(self, context: CallbackContext) -> Target | None: ...
    async def apply_persisted(self, context: CallbackContext, target: Target) -> None: ...
    async def apply_failed(self, context: CallbackContext, error: str) -> None: ...
    async def apply_forcesave_failed(self, context: CallbackContext, error: str) -> None: ...


def normalize_onlyoffice_callback_status(body: dict[str, Any]) -> CallbackOutcome:
    """Каноническая карта: 2/6+url → PERSISTED; 3,7,2/6-без-url → FAILED; прочее → IGNORE."""
    status = body.get("status")
    url = body.get("url")
    if status in (2, 6):
        if url:
            return CallbackOutcome(PhysicalOutcome.PERSISTED, url=str(url), oo_status=status)
        return CallbackOutcome(PhysicalOutcome.FAILED, oo_status=status, error="no_url_for_save_status")
    if status == 3:
        return CallbackOutcome(PhysicalOutcome.FAILED, oo_status=3, error="forcesave_callback_status_3_no_url")
    if status == 7:
        return CallbackOutcome(PhysicalOutcome.FAILED, oo_status=7, error="forcesave_callback_status_7")
    return CallbackOutcome(PhysicalOutcome.IGNORE, oo_status=status)


class OnlyOfficeCallbackPipeline:
    def __init__(
        self,
        downloader: DocumentDownloader,
        command_client: OnlyOfficeCommandClient,
        strategies: Mapping[CallbackKind, PersistenceStrategy],
        tracker,
    ) -> None:
        self._downloader = downloader
        self._command_client = command_client
        self._strategies = strategies
        self._tracker = tracker

    def _strategy(self, kind: CallbackKind) -> PersistenceStrategy:
        return self._strategies[kind]

    async def request_forcesave(self, context: CallbackContext, document_key: str) -> dict[str, Any]:
        """Register pending → CommandClient.force_save → no_changes | save_requested | raise."""
        userdata = context.userdata
        if userdata:
            await self._tracker.register(userdata, context.kind.value, str(context.entity_id))
        try:
            command_error = await self._command_client.force_save(document_key, userdata=userdata)
        except HRMSException as exc:
            if userdata:
                await self._tracker.mark_failed(userdata, "onlyoffice_forcesave_failed")
            await self._strategy(context.kind).apply_forcesave_failed(context, str(exc))
            raise
        if command_error == 4:
            if userdata:
                await self._tracker.mark_no_changes(userdata)
            return {"message": "no_changes", "save_id": userdata, "command_error": 4}
        return {"message": "save_requested", "save_id": userdata, "command_error": None}

    async def handle_callback(self, context: CallbackContext, body: dict[str, Any]) -> CallbackResult:
        outcome = normalize_onlyoffice_callback_status(body)
        strategy = self._strategy(context.kind)

        if outcome.kind == PhysicalOutcome.IGNORE:
            return CallbackResult(PhysicalOutcome.IGNORE, 0)

        if outcome.kind == PhysicalOutcome.FAILED:
            logger.warning(
                "[onlyoffice callback] failed status kind=%s entity_id=%s status=%s save_id=%s",
                context.kind.value,
                context.entity_id,
                outcome.oo_status,
                context.userdata,
            )
            await strategy.apply_failed(context, outcome.error or "onlyoffice_callback_failed")
            if context.userdata:
                await self._tracker.mark_failed(context.userdata, outcome.error, oo_status=outcome.oo_status)
            return CallbackResult(PhysicalOutcome.FAILED, 0)

        target = await strategy.resolve_target(context)
        if target is None:
            logger.warning(
                "[onlyoffice callback] target not found kind=%s entity_id=%s save_id=%s",
                context.kind.value,
                context.entity_id,
                context.userdata,
            )
            await strategy.apply_failed(context, "target_not_found")
            if context.userdata:
                await self._tracker.mark_failed(context.userdata, "target_not_found", oo_status=outcome.oo_status)
            return CallbackResult(PhysicalOutcome.FAILED, 0, error="target_not_found")

        try:
            await self._downloader.download_and_replace(outcome.url or "", target.path)
        except Exception as exc:
            logger.exception(
                "[onlyoffice callback] download failed kind=%s entity_id=%s save_id=%s",
                context.kind.value,
                context.entity_id,
                context.userdata,
            )
            await strategy.apply_failed(context, str(exc))
            if context.userdata:
                await self._tracker.mark_failed(context.userdata, str(exc), oo_status=outcome.oo_status)
            return CallbackResult(PhysicalOutcome.FAILED, 1, error=str(exc))

        file_mtime = int(target.path.stat().st_mtime) if target.path.exists() else None
        try:
            await strategy.apply_persisted(context, target)
        except Exception as exc:
            logger.exception(
                "[onlyoffice callback] apply_persisted failed kind=%s entity_id=%s save_id=%s",
                context.kind.value,
                context.entity_id,
                context.userdata,
            )
            if context.userdata:
                await self._tracker.mark_persisted(context.userdata, outcome.oo_status, file_mtime)
            return CallbackResult(PhysicalOutcome.PERSISTED, 1, error=str(exc))

        if context.userdata:
            await self._tracker.mark_persisted(context.userdata, outcome.oo_status, file_mtime)
        return CallbackResult(PhysicalOutcome.PERSISTED, 0)


def _entity_id_str(context: CallbackContext) -> str:
    return str(context.entity_id)


def _entity_id_int(context: CallbackContext) -> int:
    return int(context.entity_id)


class OrderStrategy:
    async def resolve_target(self, context: CallbackContext) -> Target | None:
        if context.db is None:
            return None
        try:
            order = await order_service.get_by_id(context.db, _entity_id_int(context))
        except HRMSException:
            return None
        if order and order.file_path:
            return Target(storage_path(order.file_path, "ORDERS_PATH"))
        return None

    async def apply_persisted(self, context: CallbackContext, target: Target) -> None:
        return None

    async def apply_failed(self, context: CallbackContext, error: str) -> None:
        return None

    async def apply_forcesave_failed(self, context: CallbackContext, error: str) -> None:
        return None


class OrderDraftStrategy:
    async def resolve_target(self, context: CallbackContext) -> Target | None:
        try:
            path = order_draft_service.get_draft_path(_entity_id_str(context))
        except HRMSException:
            return None
        return Target(path)

    async def apply_persisted(self, context: CallbackContext, target: Target) -> None:
        try:
            await order_draft_service.update_save_status(_entity_id_str(context), state="saved")
        except Exception:
            logger.exception(
                "[onlyoffice callback] draft save_status update failed entity_id=%s",
                context.entity_id,
            )

    async def _mark_save_status_error(self, context: CallbackContext, error: str) -> None:
        try:
            await order_draft_service.update_save_status(_entity_id_str(context), state="error", error=error)
        except Exception:
            logger.exception(
                "[onlyoffice callback] draft save_status update failed entity_id=%s",
                context.entity_id,
            )

    async def apply_failed(self, context: CallbackContext, error: str) -> None:
        await self._mark_save_status_error(context, error)

    async def apply_forcesave_failed(self, context: CallbackContext, error: str) -> None:
        await self._mark_save_status_error(context, error)


class _DbRecordStrategy:
    def __init__(self, *, model: type, path_func: Callable[..., Path], draft_service: Any) -> None:
        self._model = model
        self._path_func = path_func
        self._draft_service = draft_service

    async def resolve_target(self, context: CallbackContext) -> Target | None:
        if context.db is None:
            return None
        record = await context.db.get(self._model, context.entity_id)
        if record and record.file_path:
            return Target(self._path_func(record.file_path))
        return None

    async def apply_persisted(self, context: CallbackContext, target: Target) -> None:
        assert context.db is not None
        await self._draft_service.commit(context.db, _entity_id_int(context))

    async def apply_failed(self, context: CallbackContext, error: str) -> None:
        return None

    async def apply_forcesave_failed(self, context: CallbackContext, error: str) -> None:
        return None


class NotificationStrategy(_DbRecordStrategy):
    def __init__(self) -> None:
        super().__init__(
            model=Notification,
            path_func=notifications_path,
            draft_service=notification_draft_service,
        )


class StatementStrategy(_DbRecordStrategy):
    def __init__(self) -> None:
        super().__init__(
            model=Statement,
            path_func=statements_path,
            draft_service=statement_draft_service,
        )


class TemplateStrategy:
    """Стратегия шаблонов приказов (order-types): скачать файл, без commit и без save_status.

    resolve_target возвращает путь шаблона через path_func (get_template_path);
    apply_* — no-op: у шаблона нет save-status записи и commit-этапа.
    """

    def __init__(self, path_func: Callable[[object], Path]) -> None:
        self._path_func = path_func

    async def resolve_target(self, context: CallbackContext) -> Target | None:
        if context.db is None:
            return None
        try:
            order_type = await order_service.get_order_type_by_id(context.db, int(context.entity_id))
        except HRMSException:
            return None
        if order_type is None:
            return None
        return Target(self._path_func(order_type))

    async def apply_persisted(self, context: CallbackContext, target: Target) -> None:
        return None

    async def apply_failed(self, context: CallbackContext, error: str) -> None:
        return None

    async def apply_forcesave_failed(self, context: CallbackContext, error: str) -> None:
        return None


# Импорт локально в момент создания BUILTIN_STRATEGIES (а не наверху модуля),
# чтобы не тащить order_document_service в граф импорта pipeline (риск циклов).
from app.services.order_document_service import get_template_path  # noqa: E402

BUILTIN_STRATEGIES: Mapping[CallbackKind, PersistenceStrategy] = {
    CallbackKind.ORDER: OrderStrategy(),
    CallbackKind.ORDER_DRAFT: OrderDraftStrategy(),
    CallbackKind.NOTIFICATION: NotificationStrategy(),
    CallbackKind.STATEMENT: StatementStrategy(),
    CallbackKind.TEMPLATE: TemplateStrategy(path_func=cast(Callable[[object], Path], get_template_path)),
}

onlyoffice_callback_pipeline = OnlyOfficeCallbackPipeline(
    downloader=cast(DocumentDownloader, onlyoffice_service),
    command_client=cast(OnlyOfficeCommandClient, onlyoffice_service),
    strategies=BUILTIN_STRATEGIES,
    tracker=onlyoffice_save_tracker,
)
