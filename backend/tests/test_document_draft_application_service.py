"""Application service создания черновиков уведомлений/заявлений (ADR-0008, #97).

Специализированные create БД-видов вне общего `DocumentDraftService.create_draft`:
каждый вид — своя команда и свой application-сервис. Роутер конструирует
`Create*DraftCommand` и делегирует сервису.
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import Any, cast

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.schemas.notification import NotificationCreate
from app.schemas.statement import StatementCreate
from app.services import document_draft_application_service as app_svc_module
from app.services.document_draft_application_service import (
    CreateNotificationDraftCommand,
    CreateStatementDraftCommand,
    notification_draft_application_service,
    statement_draft_application_service,
)


def _db() -> AsyncSession:
    return cast(AsyncSession, object())


async def test_notification_draft_app_service_delegates(monkeypatch):
    calls: list[Any] = []

    async def fake_ensure(db):
        calls.append("ensure")

    async def fake_create_draft(db, data):
        calls.append(("create", data.title))
        return {"draft_id": "42", "notification_id": 42}

    monkeypatch.setattr(app_svc_module, "notification_type_service", SimpleNamespace(
        ensure_default_notification_types=fake_ensure
    ))
    monkeypatch.setattr(app_svc_module, "notification_draft_service", SimpleNamespace(create_draft=fake_create_draft))

    data = NotificationCreate(title="Уведомление", date=date(2026, 1, 2))
    result = await notification_draft_application_service.create_draft(_db(), CreateNotificationDraftCommand(data=data))

    assert calls == ["ensure", ("create", "Уведомление")]
    assert result == {"draft_id": "42", "notification_id": 42}


async def test_statement_draft_app_service_delegates(monkeypatch):
    calls: list[Any] = []

    async def fake_ensure(db):
        calls.append("ensure")

    async def fake_create_draft(db, data):
        calls.append(("create", data.title))
        return {"draft_id": "7", "statement_id": 7}

    monkeypatch.setattr(app_svc_module, "statement_type_service", SimpleNamespace(
        ensure_default_statement_types=fake_ensure
    ))
    monkeypatch.setattr(app_svc_module, "statement_draft_service", SimpleNamespace(create_draft=fake_create_draft))

    data = StatementCreate(title="Заявление", date=date(2026, 1, 3))
    result = await statement_draft_application_service.create_draft(_db(), CreateStatementDraftCommand(data=data))

    assert calls == ["ensure", ("create", "Заявление")]
    assert result == {"draft_id": "7", "statement_id": 7}


async def test_create_notification_draft_router_delegates(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    captured: dict[str, Any] = {}

    async def fake_create(db, command):
        captured["command"] = command
        return {"draft_id": "42", "notification_id": 42}

    monkeypatch.setattr(oo_api.notification_draft_application_service, "create_draft", fake_create)

    data = NotificationCreate(title="Уведомление", date=date(2026, 1, 2))
    result = await oo_api.create_notification_draft(data=data, db=_db(), current_user="admin")

    assert result == {"draft_id": "42", "notification_id": 42}
    assert isinstance(captured["command"], CreateNotificationDraftCommand)
    assert captured["command"].data is data


async def test_create_statement_draft_router_delegates(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    captured: dict[str, Any] = {}

    async def fake_create(db, command):
        captured["command"] = command
        return {"draft_id": "7", "statement_id": 7}

    monkeypatch.setattr(oo_api.statement_draft_application_service, "create_draft", fake_create)

    data = StatementCreate(title="Заявление", date=date(2026, 1, 3))
    result = await oo_api.create_statement_draft(data=data, db=_db(), current_user="admin")

    assert result == {"draft_id": "7", "statement_id": 7}
    assert isinstance(captured["command"], CreateStatementDraftCommand)
    assert captured["command"].data is data
