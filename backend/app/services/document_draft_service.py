"""Общий lifecycle-сервис черновиков документов (резолюция #80, #84, #85).

Полный lifecycle: create (#85) → finalize (#85) → delete (#84).

Два сценария:
- БД-виды (уведомление/заявление): `create_draft(db, data)` рендерит docx и
  регистрирует строку `is_draft=True`; `finalize(db, record_id, url)` по
  callback-у OnlyOffice скачивает файл и делает из черновика документ
  (`is_draft=False`); `delete(db, record)` удаляет строку и файл.
- Файловые черновики приказов (до commit DB-строки нет): `delete_file_only`
  и собственная приказная машинерия в `OrderDraftService` (create не
  переписывается — #80).

Уведомления/заявления конфигурируются инстансом через `DraftServiceConfig`:
модель, директория, билдер замен, схема входа и т.д. — без подклассов (#80).
"""
from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.core.paths import notifications_path, statements_path, storage_root
from app.models.employee import Employee
from app.models.notification import Notification
from app.models.statement import Statement
from app.services.docx_renderer import load_template_or_create_blank, render_docx_placeholders
from app.services.notification_type_service import (
    get_template_path as get_notification_template_path,
    notification_type_service,
)
from app.services.onlyoffice_service import onlyoffice_service
from app.services.statement_type_service import (
    get_template_path as get_statement_template_path,
    statement_type_service,
)
from app.services.template_replacements import (
    build_notification_replacements,
    build_statement_replacements,
)


def _build_notification_replacements(
    *,
    title: str,
    number: str,
    doc_date: Any,
    employee: Any,
    type_obj: Any,
    extra_fields: dict | None,
) -> dict[str, str]:
    return build_notification_replacements(
        title=title,
        number=number,
        doc_date=doc_date,
        employee=employee,
        notification_type_name=type_obj.name if type_obj else "",
        notification_type_code=type_obj.code if type_obj else "",
        extra_fields=extra_fields,
    )


def _build_statement_replacements(
    *,
    title: str,
    number: str,
    doc_date: Any,
    employee: Any,
    type_obj: Any,
    extra_fields: dict | None,
) -> dict[str, str]:
    return build_statement_replacements(
        title=title,
        number=number,
        doc_date=doc_date,
        employee=employee,
        statement_type_name=type_obj.name if type_obj else "",
        statement_type_code=type_obj.code if type_obj else "",
        extra_fields=extra_fields,
    )


@dataclass(frozen=True)
class DraftServiceConfig:
    """Конфигурация инстанса БД-вида (уведомление/заявление) для #85.

    Всё, что отличает один БД-вид от другого: модель, директория, схема входа,
    билдер замен и коды ошибок.
    """

    kind: str
    model: type
    dir_key: str
    id_key: str
    title_prefix: str
    type_attr: str
    type_getter: Callable[..., Awaitable[Any]]
    template_getter: Callable[..., Path]
    replacements_builder: Callable[..., dict[str, str]]
    path_func: Callable[..., Path]
    not_found_code: str
    file_not_found_code: str
    label: str


class DocumentDraftService:
    """Базовый lifecycle черновиков/документов.

    `create_draft(db, data)` — общий пайплайн «шаблон → подстановки → рендер →
    docx → регистрация» (#85). `finalize(db, record_id, url)` — явный переход
    «черновик → документ» по callback-у OnlyOffice (#81). `delete(db, record)`
    и `delete_file_only(draft_id)` — удаление (#84).

    БД-виды настраиваются `config` (см. `DraftServiceConfig`). Приказная
    машинерия живёт в самостоятельном `OrderDraftService` (не наследует базу).
    """

    def __init__(self, *, config: DraftServiceConfig | None = None) -> None:
        self.config = config

    def _config(self) -> DraftServiceConfig:
        if self.config is None:
            raise NotImplementedError(f"{type(self).__name__} не сконфигурирован для create/finalize")
        return self.config

    # ─── create (#85) ────────────────────────────────────────────────────────

    async def create_draft(self, db: AsyncSession, data: Any) -> dict[str, Any]:
        """Общий пайплайн создания черновика БД-вида.

        Номер → тип/сотрудник → замены → рендер → уникальный файл → сохранение
        с таймаутом → строка `is_draft=True`. Возвращает `{"draft_id", id_key}`.
        """
        cfg = self._config()
        type_obj = await self._load_type(db, data, cfg)
        employee = await self._load_employee(db, data)
        number = await self._generate_number(db, data, cfg)
        title = self._build_title(data, number, type_obj, cfg)
        doc_date = data.date

        replacements = cfg.replacements_builder(
            title=title,
            number=number,
            doc_date=doc_date,
            employee=employee,
            type_obj=type_obj,
            extra_fields=data.extra_fields,
        )
        doc = await self._load_document(type_obj, cfg)
        render_docx_placeholders(doc, replacements)

        file_path = self._unique_file_path(number, title, cfg)
        await asyncio.wait_for(
            asyncio.to_thread(doc.save, str(file_path)),
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
        )

        record = self._register_draft(
            db,
            data,
            cfg=cfg,
            title=title,
            number=number,
            doc_date=doc_date,
            file_name=file_path.name,
        )
        await db.commit()
        await db.refresh(record)
        return {"draft_id": str(record.id), cfg.id_key: record.id}

    async def _load_type(self, db: AsyncSession, data: Any, cfg: DraftServiceConfig) -> Any:
        type_id = getattr(data, cfg.type_attr, None)
        if type_id is None:
            return None
        return await cfg.type_getter(db, type_id)

    async def _load_employee(self, db: AsyncSession, data: Any) -> Any:
        if data.employee_id is None:
            return None
        result = await db.execute(
            select(Employee)
            .options(joinedload(Employee.position), joinedload(Employee.department))
            .where(Employee.id == data.employee_id)
        )
        return result.scalar_one_or_none()

    async def _generate_number(self, db: AsyncSession, data: Any, cfg: DraftServiceConfig) -> str:
        number = data.number or ""
        if number:
            return number
        result = await db.execute(
            select(cfg.model.number)
            .where(cfg.model.number.isnot(None))
            .order_by(cfg.model.id.desc())
            .limit(1)
        )
        last_number = result.scalar_one_or_none()
        if not last_number:
            return "1"
        match = re.search(r"\d+", last_number)
        return str(int(match.group()) + 1) if match else "1"

    def _build_title(self, data: Any, number: str, type_obj: Any, cfg: DraftServiceConfig) -> str:
        if data.title:
            return data.title
        type_name = type_obj.name if type_obj else ""
        return f"{cfg.title_prefix} {type_name} {number}"

    async def _load_document(self, type_obj: Any, cfg: DraftServiceConfig):
        """Загрузить шаблон (или пустой документ), как в старом create-хендлере."""
        if type_obj and getattr(type_obj, "template_filename", None):
            template_path = cfg.template_getter(type_obj)
            if template_path.exists():
                return await load_template_or_create_blank(template_path)
            return self._blank_document(cfg)
        default_template = storage_root(cfg.dir_key) / "template.docx"
        if default_template.exists():
            return await load_template_or_create_blank(default_template)
        return self._blank_document(cfg)

    def _blank_document(self, cfg: DraftServiceConfig):
        try:
            from docx import Document

            return Document()
        except ImportError:
            raise HRMSException(f"Шаблон {cfg.label} не найден", "template_not_found", status_code=404)

    def _unique_file_path(self, number: str, title: str, cfg: DraftServiceConfig) -> Path:
        docs_dir = storage_root(cfg.dir_key)
        docs_dir.mkdir(parents=True, exist_ok=True)
        safe_title = title[:50].replace("/", "_").replace("\\", "_")
        file_path = docs_dir / f"{number}_{safe_title}.docx"
        counter = 1
        while file_path.exists():
            file_path = docs_dir / f"{number}_{safe_title}_{counter}.docx"
            counter += 1
        return file_path

    def _register_draft(
        self,
        db: AsyncSession,
        data: Any,
        *,
        cfg: DraftServiceConfig,
        title: str,
        number: str,
        doc_date: Any,
        file_name: str,
    ) -> Any:
        type_id = getattr(data, cfg.type_attr, None)
        record = cfg.model(
            title=title,
            number=number,
            date=doc_date,
            employee_id=data.employee_id,
            **{cfg.type_attr: type_id},
            content=data.content,
            extra_fields=data.extra_fields,
            file_path=file_name,
            is_draft=True,
        )
        db.add(record)
        return record

    # ─── finalize (#85, резолюция #81) ──────────────────────────────────────

    async def finalize(self, db: AsyncSession, record_id: int, url: str) -> None:
        """Явный переход «черновик → документ» по callback-у OnlyOffice.

        `download_and_replace` — всегда; флип `is_draft=False` — только если
        объект ещё черновик; `db.commit()` — всегда. Идемпотентен: повторный
        вызов на документе просто перезаписывает файл. Пробрасывает
        `HRMSException` (502 от скачивания, 404 если объект/файл не найден).
        """
        cfg = self._config()
        record = await self._get_record(db, record_id, cfg)
        if record is None:
            raise HRMSException("Документ не найден", cfg.not_found_code, status_code=404)
        file_path = self._resolve_file_path(record, record.file_path) if record.file_path else None
        if file_path is None:
            raise HRMSException("Файл документа не найден", cfg.file_not_found_code, status_code=404)
        await onlyoffice_service.download_and_replace(url, file_path)
        if getattr(record, "is_draft", False):
            record.is_draft = False
        await db.commit()

    async def commit(self, db: AsyncSession, record_id: int) -> None:
        """Явный commit черновика из редактора (#86): снять `is_draft` без скачивания.

        Файл уже персистен — либо без правок (forcesave вернул no_changes),
        либо скачан callback-ом `finalize`. Идемпотентен: повторный вызов на
        документе — no-op. Пробрасывает 404, если объект не найден.
        """
        cfg = self._config()
        record = await self._get_record(db, record_id, cfg)
        if record is None:
            raise HRMSException("Документ не найден", cfg.not_found_code, status_code=404)
        if getattr(record, "is_draft", False):
            record.is_draft = False
        await db.commit()

    async def _get_record(self, db: AsyncSession, record_id: int, cfg: DraftServiceConfig) -> Any:
        return await db.get(cfg.model, record_id)

    # ─── delete (#84) ────────────────────────────────────────────────────────

    async def delete(self, db: AsyncSession, record: Any) -> None:
        """Удалить DB-строку, затем (best-effort) связанные файлы.

        Сначала БД, потом unlink — исключает состояние «строка есть, файла
        нет» (download не ломается). Сбой unlink не роняет delete().
        """
        await db.delete(record)
        await db.commit()
        self._cleanup_files(record)

    async def delete_file_only(self, draft_id: str) -> None:
        """Только файловая чистка (файловые черновики без DB-строки)."""
        self._cleanup_files(draft_id)

    def _cleanup_files(self, record: Any) -> None:
        """Best-effort чистка файлов записи. Не роняет delete() (#84).

        `file_path is None` → пропуск; файл отсутствует → `missing_ok`;
        OSError и нерезолвящиеся пути → молчаливое игнорирование.
        """
        file_path = getattr(record, "file_path", None)
        if not file_path:
            return
        try:
            path = self._resolve_file_path(record, file_path)
        except (ValueError, TypeError, NotImplementedError):
            return
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass

    def _resolve_file_path(self, record: Any, file_path: str):
        if self.config is not None:
            return self.config.path_func(file_path)
        raise NotImplementedError


# Конфигурируемые инстансы БД-видов (#80, #85): общий `DocumentDraftService`
# с параметрами вида — без подклассов.
notification_draft_service = DocumentDraftService(
    config=DraftServiceConfig(
        kind="notification",
        model=Notification,
        dir_key="NOTIFICATIONS_PATH",
        id_key="notification_id",
        title_prefix="Уведомление",
        type_attr="notification_type_id",
        type_getter=notification_type_service.get_notification_type,
        template_getter=get_notification_template_path,
        replacements_builder=_build_notification_replacements,
        path_func=notifications_path,
        not_found_code="notification_not_found",
        file_not_found_code="notification_file_not_found",
        label="уведомления",
    )
)

statement_draft_service = DocumentDraftService(
    config=DraftServiceConfig(
        kind="statement",
        model=Statement,
        dir_key="STATEMENTS_PATH",
        id_key="statement_id",
        title_prefix="Заявление",
        type_attr="statement_type_id",
        type_getter=statement_type_service.get_statement_type,
        template_getter=get_statement_template_path,
        replacements_builder=_build_statement_replacements,
        path_func=statements_path,
        not_found_code="statement_not_found",
        file_not_found_code="statement_file_not_found",
        label="заявления",
    )
)
