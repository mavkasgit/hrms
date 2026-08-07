"""Общий lifecycle-сервис черновиков документов (резолюция #80, #84).

В рамках #84 реализован только delete: удаление DB-строки + best-effort
файловая чистка через переопределяемый хук `_cleanup_files`. Create и
finalize — за пределами этого тикета.

Два сценария:
- БД-виды (уведомление/заявление): `delete(db, record)` удаляет строку и
  файл — осиротевший `.docx` больше не остаётся после удаления.
- Файловые черновики приказов (до commit DB-строки нет): `delete_file_only`.
"""
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.paths import notifications_path, statements_path
from app.models.notification import Notification
from app.models.statement import Statement


class DocumentDraftService:
    """Базовый lifecycle черновиков/документов.

    `delete(db, record)` — для БД-видов: строка + файл через хук.
    `delete_file_only(draft_id)` — для файловых черновиков: только файл.
    """

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
        raise NotImplementedError


class DbDraftDocumentService(DocumentDraftService):
    """Лёгкий БД-наследник для пары уведомление/заявление (#84).

    Хук unlink'ает docx по `notifications_path` / `statements_path`
    в зависимости от типа записи.
    """

    def _resolve_file_path(self, record: Any, file_path: str):
        if isinstance(record, Notification):
            return notifications_path(file_path)
        if isinstance(record, Statement):
            return statements_path(file_path)
        raise ValueError(f"Неизвестный тип записи: {type(record).__name__}")


db_draft_document_service = DbDraftDocumentService()
