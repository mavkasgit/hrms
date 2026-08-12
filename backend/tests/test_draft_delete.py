"""Tests for the delete-семантики черновиков (#84, #98).

Проверяют внешнее поведение общего lifecycle удаления `DocumentDraftService`:

- `delete(db, record)` для пары уведомление/заявление удаляет и DB-строку,
  и файл на диске;
- delete не падает при `file_path=None`, отсутствующем файле и OSError;
- `delete_file_only(draft_id)` для приказа чистит docx + метаданные JSON
  + commit-lock;
- роутеры: 404 для несуществующего id, статус-код 204.

Guard #98 (delete_draft vs delete_document):
- `delete` (delete_draft) на документ (is_draft=False) → 409, строка/файл целы;
- `delete_document` на черновик (is_draft=True) → 409;
- `delete_document` на документ → удаляет строку и файл.
"""

from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.core.paths import notifications_path, statements_path
from app.models.notification import Notification
from app.models.statement import Statement
from app.services.document_draft_service import notification_draft_service, statement_draft_service
from app.services.draft_ref import DraftRef

pytestmark = pytest.mark.asyncio(loop_scope="module")

ORDER_DRAFT_ID = "44444444-4444-4444-4444-444444444444"


@pytest.fixture(autouse=True)
def _tmp_storage(monkeypatch, tmp_path):
    """Направляем storage-директории пары и приказов во временную папку."""
    notif_root = tmp_path / "notifications"
    stmt_root = tmp_path / "statements"
    orders_root = tmp_path / "orders"
    notif_root.mkdir(parents=True, exist_ok=True)
    stmt_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "NOTIFICATIONS_PATH", str(notif_root))
    monkeypatch.setattr(settings, "STATEMENTS_PATH", str(stmt_root))
    monkeypatch.setattr(settings, "ORDERS_PATH", str(orders_root))
    return {"notifications": notif_root, "statements": stmt_root, "orders": orders_root}


# ── delete(db, record): пара уведомление/заявление ─────────────────────────


async def _make_notification(db_session, *, file_path: str | None = "notif.docx", is_draft: bool = True):
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


async def _make_statement(db_session, *, file_path: str | None = "stmt.docx", is_draft: bool = True):
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


async def test_delete_notification_removes_row_and_file(db_session, _tmp_storage):
    notification = await _make_notification(db_session)
    assert notification.file_path is not None
    disk_path = notifications_path(notification.file_path)
    disk_path.write_bytes(b"docx")

    await notification_draft_service.delete(db_session, notification)

    assert await db_session.get(Notification, notification.id) is None
    assert not disk_path.exists()


async def test_delete_statement_removes_row_and_file(db_session, _tmp_storage):
    statement = await _make_statement(db_session)
    assert statement.file_path is not None
    disk_path = statements_path(statement.file_path)
    disk_path.write_bytes(b"docx")

    await statement_draft_service.delete(db_session, statement)

    assert await db_session.get(Statement, statement.id) is None
    assert not disk_path.exists()


async def test_delete_without_file_path_ok(db_session, _tmp_storage):
    notification = await _make_notification(db_session, file_path=None)

    await notification_draft_service.delete(db_session, notification)

    assert await db_session.get(Notification, notification.id) is None


async def test_delete_when_file_missing_ok(db_session, _tmp_storage):
    notification = await _make_notification(db_session, file_path="missing.docx")

    await notification_draft_service.delete(db_session, notification)

    assert await db_session.get(Notification, notification.id) is None


async def test_delete_survives_oserror(db_session, _tmp_storage):
    notification = await _make_notification(db_session, file_path="dir.docx")
    # На месте файла — директория: unlink роняет IsADirectoryError (OSError).
    assert notification.file_path is not None
    notifications_path(notification.file_path).mkdir(parents=True, exist_ok=True)

    await notification_draft_service.delete(db_session, notification)

    assert await db_session.get(Notification, notification.id) is None


# ── delete_file_only(draft_id): приказы (файловые черновики) ───────────────


async def test_delete_file_only_cleans_docx_metadata_and_lock(_tmp_storage):
    from app.services.order_draft_service import OrderDraftService

    svc = OrderDraftService()
    svc.ensure_drafts_dir()

    docx = svc._drafts_dir / f"{ORDER_DRAFT_ID}_draft.docx"
    docx.write_bytes(b"docx")
    metadata = svc.get_metadata_path(ORDER_DRAFT_ID)
    metadata.write_text('{"draft_id": "x"}', encoding="utf-8")
    lock = svc._commit_lock_path(ORDER_DRAFT_ID)
    lock.write_text("1", encoding="utf-8")

    await svc.delete_file_only(ORDER_DRAFT_ID)

    assert not docx.exists()
    assert not metadata.exists()
    assert not lock.exists()


async def test_delete_file_only_missing_draft_ok(_tmp_storage):
    from app.services.order_draft_service import OrderDraftService

    svc = OrderDraftService()

    await svc.delete_file_only(ORDER_DRAFT_ID)


async def test_order_delete_draft_does_not_touch_db(_tmp_storage):
    """#98: delete приказа — только файловая чистка, никогда не трогает Order."""
    from unittest.mock import MagicMock

    from app.services.draft_adapter import OrderDraftAdapter

    db = MagicMock()
    await OrderDraftAdapter().delete_draft(db, "actor", DraftRef.order(ORDER_DRAFT_ID))

    db.get.assert_not_called()


# ── Guard #98: delete_draft удаляет только черновик (is_draft=True) ─────────


def _assert_conflict(exc, status_code: int = 409):
    assert exc.value.status_code == status_code

async def test_delete_committed_notification_conflict(db_session, _tmp_storage):
    notification = await _make_notification(db_session, is_draft=False)
    assert notification.file_path is not None
    disk_path = notifications_path(notification.file_path)
    disk_path.write_bytes(b"docx")

    with pytest.raises(HRMSException) as exc:
        await notification_draft_service.delete(db_session, notification)

    assert exc.value.status_code == 409
    assert exc.value.error_code == "notification_not_a_draft"
    assert await db_session.get(Notification, notification.id) is not None
    assert disk_path.exists()


async def test_delete_committed_statement_conflict(db_session, _tmp_storage):
    statement = await _make_statement(db_session, is_draft=False)
    assert statement.file_path is not None
    disk_path = statements_path(statement.file_path)
    disk_path.write_bytes(b"docx")

    with pytest.raises(HRMSException) as exc:
        await statement_draft_service.delete(db_session, statement)

    assert exc.value.status_code == 409
    assert exc.value.error_code == "statement_not_a_draft"
    assert await db_session.get(Statement, statement.id) is not None
    assert disk_path.exists()


async def test_notification_adapter_delete_draft_committed_conflict(db_session, _tmp_storage):
    from app.services.draft_adapter import NotificationDraftAdapter

    notification = await _make_notification(db_session, is_draft=False)

    with pytest.raises(HRMSException) as exc:
        await NotificationDraftAdapter().delete_draft(
            db_session, "actor", DraftRef.notification(notification.id)
        )

    _assert_conflict(exc)
    assert await db_session.get(Notification, notification.id) is not None


async def test_statement_adapter_delete_draft_committed_conflict(db_session, _tmp_storage):
    from app.services.draft_adapter import StatementDraftAdapter

    statement = await _make_statement(db_session, is_draft=False)

    with pytest.raises(HRMSException) as exc:
        await StatementDraftAdapter().delete_draft(
            db_session, "actor", DraftRef.statement(statement.id)
        )

    _assert_conflict(exc)
    assert await db_session.get(Statement, statement.id) is not None


async def test_delete_notification_router_409_for_committed(db_session, _tmp_storage):
    from app.api import notifications as notif_api

    notification = await _make_notification(db_session, is_draft=False)

    with pytest.raises(HRMSException) as exc:
        await notif_api.delete_notification(notification_id=notification.id, db=db_session)

    _assert_conflict(exc)
    assert await db_session.get(Notification, notification.id) is not None


async def test_delete_statement_router_409_for_committed(db_session, _tmp_storage):
    from app.api import statements as stmt_api

    statement = await _make_statement(db_session, is_draft=False)

    with pytest.raises(HRMSException) as exc:
        await stmt_api.delete_statement(statement_id=statement.id, db=db_session)

    _assert_conflict(exc)
    assert await db_session.get(Statement, statement.id) is not None


async def test_delete_draft_twice_second_is_404(db_session, _tmp_storage):
    from app.services.draft_adapter import NotificationDraftAdapter

    notification = await _make_notification(db_session)
    await NotificationDraftAdapter().delete_draft(
        db_session, "actor", DraftRef.notification(notification.id)
    )

    # Повторный delete_draft: строка уже удалена (already absent) → 404.
    with pytest.raises(HRMSException) as exc:
        await NotificationDraftAdapter().delete_draft(
            db_session, "actor", DraftRef.notification(notification.id)
        )
    assert exc.value.status_code == 404


# ── delete_document: отдельный use-case (#98) ───────────────────────────────


async def test_delete_document_on_draft_conflict(db_session, _tmp_storage):
    notification = await _make_notification(db_session, is_draft=True)

    with pytest.raises(HRMSException) as exc:
        await notification_draft_service.delete_document(db_session, notification)

    assert exc.value.status_code == 409
    assert exc.value.error_code == "notification_still_a_draft"
    assert await db_session.get(Notification, notification.id) is not None


async def test_delete_document_removes_row_and_file(db_session, _tmp_storage):
    notification = await _make_notification(db_session, is_draft=False)
    assert notification.file_path is not None
    disk_path = notifications_path(notification.file_path)
    disk_path.write_bytes(b"docx")

    await notification_draft_service.delete_document(db_session, notification)

    assert await db_session.get(Notification, notification.id) is None
    assert not disk_path.exists()


async def test_delete_document_router_409_for_draft(db_session, _tmp_storage):
    from app.api import notifications as notif_api

    notification = await _make_notification(db_session, is_draft=True)

    with pytest.raises(HRMSException) as exc:
        await notif_api.delete_notification_document(notification_id=notification.id, db=db_session)

    _assert_conflict(exc)
    assert await db_session.get(Notification, notification.id) is not None


async def test_delete_document_router_deletes_row(db_session, _tmp_storage):
    from app.api import statements as stmt_api

    statement = await _make_statement(db_session, is_draft=False)
    assert statement.file_path is not None
    disk_path = statements_path(statement.file_path)
    disk_path.write_bytes(b"docx")

    result = await stmt_api.delete_statement_document(statement_id=statement.id, db=db_session)

    assert result is None
    assert await db_session.get(Statement, statement.id) is None
    assert not disk_path.exists()


# ── Роутеры: 404 и 204 ──────────────────────────────────────────────────────


async def test_delete_notification_router_404_for_missing_id(db_session):
    from app.api import notifications as notif_api

    with pytest.raises(HTTPException) as exc:
        await notif_api.delete_notification(notification_id=999_999, db=db_session)
    assert exc.value.status_code == 404


async def test_delete_statement_router_404_for_missing_id(db_session):
    from app.api import statements as stmt_api

    with pytest.raises(HTTPException) as exc:
        await stmt_api.delete_statement(statement_id=999_999, db=db_session)
    assert exc.value.status_code == 404


async def test_delete_notification_router_deletes_row(db_session, _tmp_storage):
    from app.api import notifications as notif_api

    notification = await _make_notification(db_session)
    assert notification.file_path is not None
    disk_path = notifications_path(notification.file_path)
    disk_path.write_bytes(b"docx")

    result = await notif_api.delete_notification(notification_id=notification.id, db=db_session)

    assert result is None
    assert await db_session.get(Notification, notification.id) is None
    assert not disk_path.exists()


def _delete_route_status(router, path_suffix: str) -> int:
    routes = [
        r
        for r in router.routes
        if getattr(r, "path", "").endswith(path_suffix) and "DELETE" in getattr(r, "methods", set())
    ]
    assert len(routes) == 1, f"Ожидался ровно один DELETE-роут для {path_suffix}"
    return routes[0].status_code


async def test_delete_routes_return_204():
    from app.api import notifications as notif_api
    from app.api import onlyoffice as oo_api
    from app.api import statements as stmt_api

    assert _delete_route_status(notif_api.router, "/{notification_id:int}") == 204
    assert _delete_route_status(stmt_api.router, "/{statement_id:int}") == 204
    assert _delete_route_status(oo_api.router, "/orders/drafts/{draft_id}") == 204
    assert _delete_route_status(notif_api.router, "/{notification_id:int}/document") == 204
    assert _delete_route_status(stmt_api.router, "/{statement_id:int}/document") == 204
