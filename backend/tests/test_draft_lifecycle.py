"""Tests for единого lifecycle черновиков БД-видов (#85).

Проверяют внешнее поведение `DocumentDraftService` (create + finalize) для
пары уведомление/заявление:

- create: файл рендерится в tmp_path, строка `is_draft=True`; коллизия имени
  → уникальный суффикс;
- finalize: черновик → флаг False + commit; повторный вызов идемпотентен;
  объект не найден → 404; сбой скачивания → 502 пробрасывается, черновик
  остаётся черновиком;
- роутеры: create возвращает draft_id; callback при валидном токене и статусе
  2/6 возвращает `{"error": 0}`; при HRMSException (502) — `{"error": 1}` с
  честным кодом.
"""

from __future__ import annotations

import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.responses import JSONResponse
from jose import jwt

from app.api.notifications import NotificationCreate
from app.api.statements import StatementCreate
from app.core.config import settings
from app.core.exceptions import HRMSException
from app.core.paths import notifications_path, statements_path
from app.models.notification import Notification
from app.models.statement import Statement
from app.services.document_draft_service import (
    notification_draft_service,
    statement_draft_service,
)
from app.services.onlyoffice_service import onlyoffice_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest.fixture(autouse=True)
def _tmp_storage(monkeypatch, tmp_path):
    """Направляем storage-директории пары во временную папку."""
    notif_root = tmp_path / "notifications"
    stmt_root = tmp_path / "statements"
    notif_root.mkdir(parents=True, exist_ok=True)
    stmt_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "NOTIFICATIONS_PATH", str(notif_root))
    monkeypatch.setattr(settings, "STATEMENTS_PATH", str(stmt_root))
    return {"notifications": notif_root, "statements": stmt_root}


# ── create: уведомление/заявление ────────────────────────────────────────────


async def test_create_notification_draft_creates_file_and_row(db_session, _tmp_storage):
    data = NotificationCreate(title="Уведомление о переводе", date=date(2026, 1, 2))

    result = await notification_draft_service.create_draft(db_session, data)

    assert result["draft_id"]
    assert result["notification_id"] == int(result["draft_id"])
    notif = await db_session.get(Notification, result["notification_id"])
    assert notif is not None
    assert notif.is_draft is True
    assert notif.title == "Уведомление о переводе"
    assert notif.file_path
    assert notifications_path(notif.file_path).exists()


async def test_create_statement_draft_creates_file_and_row(db_session, _tmp_storage):
    data = StatementCreate(title="Заявление на отпуск", date=date(2026, 1, 3))

    result = await statement_draft_service.create_draft(db_session, data)

    assert result["draft_id"]
    assert result["statement_id"] == int(result["draft_id"])
    stmt = await db_session.get(Statement, result["statement_id"])
    assert stmt is not None
    assert stmt.is_draft is True
    assert stmt.file_path
    assert statements_path(stmt.file_path).exists()


async def test_create_draft_auto_generates_number(db_session, _tmp_storage):
    data = NotificationCreate(title="Без номера", date=date(2026, 1, 2))

    result = await notification_draft_service.create_draft(db_session, data)

    notif = await db_session.get(Notification, result["notification_id"])
    assert notif.number == "1"


async def test_create_draft_name_collision_gets_unique_suffix(db_session, _tmp_storage):
    data = NotificationCreate(title="X", number="7", date=date(2026, 1, 2))

    first = await notification_draft_service.create_draft(db_session, data)
    second = await notification_draft_service.create_draft(db_session, data)

    first_notif = await db_session.get(Notification, first["notification_id"])
    second_notif = await db_session.get(Notification, second["notification_id"])
    assert first_notif.file_path == "7_X.docx"
    assert second_notif.file_path == "7_X_1.docx"
    assert first_notif.file_path != second_notif.file_path


async def test_create_draft_with_employee_and_type(db_session, _tmp_storage, create_employee):
    from app.services.notification_type_service import notification_type_service

    await notification_type_service.ensure_default_notification_types(db_session)
    employee = await create_employee(name="Иванова Мария Петровна")
    notification_type = await notification_type_service.get_notification_types(db_session)
    type_id = notification_type[0]["id"] if notification_type else None

    data = NotificationCreate(
        title="",
        number="5",
        date=date(2026, 1, 2),
        employee_id=employee.id,
        notification_type_id=type_id,
    )

    result = await notification_draft_service.create_draft(db_session, data)

    notif = await db_session.get(Notification, result["notification_id"])
    assert notif.employee_id == employee.id
    assert notif.notification_type_id == type_id
    assert notif.title.startswith("Уведомление")


# ── finalize: черновик → документ ────────────────────────────────────────────


async def _make_notification(db_session, *, file_path: str | None = "n.docx", is_draft: bool = True):
    notification = Notification(
        title="Уведомление",
        number="1",
        date=date(2026, 1, 2),
        file_path=file_path,
        is_draft=is_draft,
    )
    db_session.add(notification)
    await db_session.flush()
    return notification


async def _make_statement(db_session, *, file_path: str | None = "s.docx", is_draft: bool = True):
    statement = Statement(
        title="Заявление",
        number="1",
        date=date(2026, 1, 3),
        file_path=file_path,
        is_draft=is_draft,
    )
    db_session.add(statement)
    await db_session.flush()
    return statement


async def test_finalize_turns_draft_into_document(db_session, _tmp_storage, monkeypatch):
    notification = await _make_notification(db_session)
    assert notification.file_path
    disk_path = notifications_path(notification.file_path)
    disk_path.write_bytes(b"old")

    async def fake_download(url, path):
        path.write_bytes(b"new")

    monkeypatch.setattr(onlyoffice_service, "download_and_replace", fake_download)

    await notification_draft_service.finalize(db_session, notification.id, "http://oo/f.docx")

    refreshed = await db_session.get(Notification, notification.id)
    assert refreshed.is_draft is False
    assert disk_path.read_bytes() == b"new"


async def test_finalize_commits_even_when_already_document(db_session, _tmp_storage, monkeypatch):
    notification = await _make_notification(db_session, is_draft=False)
    assert notification.file_path
    disk_path = notifications_path(notification.file_path)
    disk_path.write_bytes(b"old")

    commits: list[str] = []
    original_commit = db_session.commit

    async def spy_commit():
        commits.append("commit")
        await original_commit()

    monkeypatch.setattr(db_session, "commit", spy_commit)

    async def fake_download(url, path):
        path.write_bytes(b"new")

    monkeypatch.setattr(onlyoffice_service, "download_and_replace", fake_download)

    await notification_draft_service.finalize(db_session, notification.id, "http://oo/f.docx")

    refreshed = await db_session.get(Notification, notification.id)
    assert refreshed.is_draft is False
    assert commits, "finalize обязан вызывать db.commit()"
    assert disk_path.read_bytes() == b"new"


async def test_finalize_second_call_idempotent(db_session, _tmp_storage, monkeypatch):
    notification = await _make_notification(db_session)
    assert notification.file_path
    disk_path = notifications_path(notification.file_path)
    disk_path.write_bytes(b"old")

    calls = []
    async def fake_download(url, path):
        calls.append(url)
        path.write_bytes(b"new")

    monkeypatch.setattr(onlyoffice_service, "download_and_replace", fake_download)

    await notification_draft_service.finalize(db_session, notification.id, "http://oo/1.docx")
    await notification_draft_service.finalize(db_session, notification.id, "http://oo/2.docx")

    refreshed = await db_session.get(Notification, notification.id)
    assert refreshed.is_draft is False
    assert calls == ["http://oo/1.docx", "http://oo/2.docx"]


async def test_finalize_unknown_record_404(db_session, _tmp_storage):
    with pytest.raises(HRMSException) as exc:
        await notification_draft_service.finalize(db_session, 999_999, "http://oo/f.docx")

    assert exc.value.status_code == 404
    assert exc.value.error_code == "notification_not_found"


async def test_finalize_missing_file_path_404(db_session, _tmp_storage):
    notification = await _make_notification(db_session, file_path=None)

    with pytest.raises(HRMSException) as exc:
        await notification_draft_service.finalize(db_session, notification.id, "http://oo/f.docx")

    assert exc.value.status_code == 404
    assert exc.value.error_code == "notification_file_not_found"


async def test_finalize_download_failure_propagates_502_and_keeps_draft(db_session, _tmp_storage, monkeypatch):
    notification = await _make_notification(db_session)
    assert notification.file_path
    notifications_path(notification.file_path).write_bytes(b"old")

    async def boom(url, path):
        raise HRMSException("dl failed", "onlyoffice_save_failed", status_code=502)

    monkeypatch.setattr(onlyoffice_service, "download_and_replace", boom)

    with pytest.raises(HRMSException) as exc:
        await notification_draft_service.finalize(db_session, notification.id, "http://oo/f.docx")

    assert exc.value.status_code == 502
    refreshed = await db_session.get(Notification, notification.id)
    assert refreshed.is_draft is True


async def test_finalize_statement_turns_draft_into_document(db_session, _tmp_storage, monkeypatch):
    statement = await _make_statement(db_session)
    assert statement.file_path
    disk_path = statements_path(statement.file_path)
    disk_path.write_bytes(b"old")

    async def fake_download(url, path):
        path.write_bytes(b"new")

    monkeypatch.setattr(onlyoffice_service, "download_and_replace", fake_download)

    await statement_draft_service.finalize(db_session, statement.id, "http://oo/f.docx")

    refreshed = await db_session.get(Statement, statement.id)
    assert refreshed.is_draft is False
    assert disk_path.read_bytes() == b"new"


# ── Роутеры ──────────────────────────────────────────────────────────────────


@pytest.fixture
def _enable_onlyoffice(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")


async def test_create_notification_draft_router_returns_draft_id(db_session, _tmp_storage, _enable_onlyoffice):
    from app.api import onlyoffice as oo_api

    result = await oo_api.create_notification_draft(
        data=NotificationCreate(title="Уведомление", date=date(2026, 1, 2)),
        db=db_session,
        current_user="admin",
    )
    assert result["draft_id"]
    assert result["notification_id"] == int(result["draft_id"])


async def test_create_statement_draft_router_returns_draft_id(db_session, _tmp_storage, _enable_onlyoffice):
    from app.api import onlyoffice as oo_api

    result = await oo_api.create_statement_draft(
        data=StatementCreate(title="Заявление", date=date(2026, 1, 2)),
        db=db_session,
        current_user="admin",
    )
    assert result["draft_id"]
    assert result["statement_id"] == int(result["draft_id"])


async def test_notification_callback_success_finalizes(db_session, _tmp_storage, _enable_onlyoffice, monkeypatch):
    from app.api import onlyoffice as oo_api

    notification = await _make_notification(db_session)
    assert notification.file_path
    notifications_path(notification.file_path).write_bytes(b"old")

    async def fake_download(url, path):
        path.write_bytes(b"new")

    monkeypatch.setattr(onlyoffice_service, "download_and_replace", fake_download)

    token = jwt.encode({"status": 2}, "test-secret", algorithm="HS256")
    body = {"status": 2, "url": "http://oo/f.docx", "token": token}
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.notification_onlyoffice_callback(
        notification_id=notification.id,
        request=mock_request,
        db=db_session,
        current_user="onlyoffice_server",
    )

    assert response == {"error": 0}
    assert (await db_session.get(Notification, notification.id)).is_draft is False


async def test_statement_callback_status_6_finalizes(db_session, _tmp_storage, _enable_onlyoffice, monkeypatch):
    from app.api import onlyoffice as oo_api

    statement = await _make_statement(db_session)
    assert statement.file_path
    statements_path(statement.file_path).write_bytes(b"old")

    async def fake_download(url, path):
        path.write_bytes(b"new")

    monkeypatch.setattr(onlyoffice_service, "download_and_replace", fake_download)

    token = jwt.encode({"status": 6}, "test-secret", algorithm="HS256")
    body = {"status": 6, "url": "http://oo/f.docx", "token": token}
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.statement_onlyoffice_callback(
        statement_id=statement.id,
        request=mock_request,
        db=db_session,
        current_user="onlyoffice_server",
    )

    assert response == {"error": 0}
    assert (await db_session.get(Statement, statement.id)).is_draft is False


async def test_callback_returns_error_1_with_honest_code_on_hrms_exception(
    db_session, _tmp_storage, _enable_onlyoffice, monkeypatch
):
    from app.api import onlyoffice as oo_api

    notification = await _make_notification(db_session)
    assert notification.file_path
    notifications_path(notification.file_path).write_bytes(b"old")

    async def boom(url, path):
        raise HRMSException("dl failed", "onlyoffice_save_failed", status_code=502)

    monkeypatch.setattr(onlyoffice_service, "download_and_replace", boom)

    token = jwt.encode({"status": 6}, "test-secret", algorithm="HS256")
    body = {"status": 6, "url": "http://oo/f.docx", "token": token}
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.notification_onlyoffice_callback(
        notification_id=notification.id,
        request=mock_request,
        db=db_session,
        current_user="onlyoffice_server",
    )

    assert isinstance(response, JSONResponse)
    assert response.status_code == 502
    payload = json.loads(bytes(response.body))
    assert payload["error"] == 1
    # Черновик остаётся черновиком после неудачного сохранения.
    assert (await db_session.get(Notification, notification.id)).is_draft is True


async def test_callback_returns_error_1_404_for_unknown_record(db_session, _tmp_storage, _enable_onlyoffice):
    from app.api import onlyoffice as oo_api

    token = jwt.encode({"status": 2}, "test-secret", algorithm="HS256")
    body = {"status": 2, "url": "http://oo/f.docx", "token": token}
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.notification_onlyoffice_callback(
        notification_id=999_999,
        request=mock_request,
        db=db_session,
        current_user="onlyoffice_server",
    )

    assert isinstance(response, JSONResponse)
    assert response.status_code == 404
    payload = json.loads(bytes(response.body))
    assert payload["error"] == 1


async def test_callback_ignores_status_without_url(db_session, _tmp_storage, _enable_onlyoffice, monkeypatch):
    from app.api import onlyoffice as oo_api

    notification = await _make_notification(db_session)
    download = AsyncMock()
    monkeypatch.setattr(onlyoffice_service, "download_and_replace", download)

    token = jwt.encode({"status": 2}, "test-secret", algorithm="HS256")
    body = {"status": 2, "token": token}
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.notification_onlyoffice_callback(
        notification_id=notification.id,
        request=mock_request,
        db=db_session,
        current_user="onlyoffice_server",
    )

    assert response == {"error": 0}
    download.assert_not_awaited()
    assert (await db_session.get(Notification, notification.id)).is_draft is True


async def test_callback_rejects_invalid_token(db_session, _tmp_storage, _enable_onlyoffice):
    from app.api import onlyoffice as oo_api

    body = {"status": 2, "url": "http://oo/f.docx", "token": "bad-token"}
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.notification_onlyoffice_callback(
        notification_id=1,
        request=mock_request,
        db=db_session,
        current_user="onlyoffice_server",
    )

    assert isinstance(response, JSONResponse)
    assert response.status_code == 403
    assert json.loads(bytes(response.body))["error"] == 1
