"""Application service создания черновиков уведомлений и заявлений (ADR-0008, #97).

Специализированные create БД-видов вне общего `DocumentDraftService.create_draft`:
каждый вид получает свою команду и application-сервис. Роутер конструирует
`Create*DraftCommand` из запроса и вызывает сервис.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.notification import NotificationCreate
from app.schemas.statement import StatementCreate
from app.services.document_draft_service import (
    notification_draft_service,
    statement_draft_service,
)
from app.services.notification_type_service import notification_type_service
from app.services.statement_type_service import statement_type_service


@dataclass(frozen=True)
class CreateNotificationDraftCommand:
    """Команда создания черновика уведомления."""

    data: NotificationCreate


@dataclass(frozen=True)
class CreateStatementDraftCommand:
    """Команда создания черновика заявления."""

    data: StatementCreate


class NotificationDraftApplicationService:
    async def create_draft(self, db: AsyncSession, command: CreateNotificationDraftCommand) -> dict[str, Any]:
        await notification_type_service.ensure_default_notification_types(db)
        return await notification_draft_service.create_draft(db, command.data)


class StatementDraftApplicationService:
    async def create_draft(self, db: AsyncSession, command: CreateStatementDraftCommand) -> dict[str, Any]:
        await statement_type_service.ensure_default_statement_types(db)
        return await statement_draft_service.create_draft(db, command.data)


notification_draft_application_service = NotificationDraftApplicationService()
statement_draft_application_service = StatementDraftApplicationService()
