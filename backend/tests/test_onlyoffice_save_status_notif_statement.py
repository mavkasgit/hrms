"""Tests for OnlyOffice forcesave save-state of notifications and statements (Канд.2b).

Forcesave уведомлений/заявлений идёт через request_forcesave (как у приказов):
save_id регистрируется в трекере → pending, callback помечает persisted,
save-status endpoint отдаёт состояние, без save_id — регистрации нет.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.services.onlyoffice_save_tracker import onlyoffice_save_tracker


@pytest.fixture(autouse=True)
async def _clear_global_tracker():
    await onlyoffice_save_tracker.clear()
    yield
    await onlyoffice_save_tracker.clear()


class _FakeDB:
    """Минимальный AsyncSession-заменитель: get возвращает запись, commit — no-op."""

    def __init__(self, record: Any = None) -> None:
        self._record = record

    async def get(self, model, entity_id):
        return self._record

    async def commit(self) -> None:
        return None


def _entity_kwargs(kind: str, entity_id: int) -> dict[str, Any]:
    if kind == "notification":
        return {"notification_id": entity_id}
    return {"statement_id": entity_id}


# ── forcesave → трекер ──────────────────────────────────────────────────────


@pytest.mark.parametrize("kind", ["notification", "statement"])
async def test_forcesave_with_save_id_registers_pending(monkeypatch, kind):
    from app.api import onlyoffice as oo_api
    from app.api.onlyoffice import OnlyOfficeForceSaveRequest

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    save_id = f"sid-{kind}"

    async def fake_force_save(key, userdata=None):
        assert userdata == save_id
        return 0

    monkeypatch.setattr(oo_api.onlyoffice_service, "force_save", fake_force_save)

    if kind == "notification":
        result = await oo_api.notification_onlyoffice_forcesave(
            notification_id=1,
            data=OnlyOfficeForceSaveRequest(document_key="notification-1-x", save_id=save_id),
            current_user="admin",
        )
    else:
        result = await oo_api.statement_onlyoffice_forcesave(
            statement_id=1,
            data=OnlyOfficeForceSaveRequest(document_key="statement-1-x", save_id=save_id),
            current_user="admin",
        )

    assert result["message"] == "save_requested"
    assert result["save_id"] == save_id
    status = await onlyoffice_save_tracker.get(save_id)
    assert status["state"] == "pending"


@pytest.mark.parametrize("kind", ["notification", "statement"])
async def test_forcesave_without_save_id_skips_tracker(monkeypatch, kind):
    from app.api import onlyoffice as oo_api
    from app.api.onlyoffice import OnlyOfficeForceSaveRequest

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)

    async def fake_force_save(key, userdata=None):
        assert userdata is None
        return None

    monkeypatch.setattr(oo_api.onlyoffice_service, "force_save", fake_force_save)

    if kind == "notification":
        result = await oo_api.notification_onlyoffice_forcesave(
            notification_id=1,
            data=OnlyOfficeForceSaveRequest(document_key="notification-1-x", save_id=None),
            current_user="admin",
        )
    else:
        result = await oo_api.statement_onlyoffice_forcesave(
            statement_id=1,
            data=OnlyOfficeForceSaveRequest(document_key="statement-1-x", save_id=None),
            current_user="admin",
        )

    assert result["message"] == "save_requested"
    assert result["save_id"] is None
    status = await onlyoffice_save_tracker.get("never-registered")
    assert status["state"] == "unknown"


# ── callback → mark_persisted ───────────────────────────────────────────────


@pytest.mark.parametrize("kind", ["notification", "statement"])
async def test_callback_marks_persisted(monkeypatch, tmp_path, kind):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "NOTIFICATIONS_PATH", str(tmp_path))
    monkeypatch.setattr(settings, "STATEMENTS_PATH", str(tmp_path))

    save_id = f"cb-{kind}"
    await onlyoffice_save_tracker.register(save_id, kind, 1)

    target = tmp_path / f"{kind}.docx"
    target.write_bytes(b"old")
    record = SimpleNamespace(id=1, file_path=f"{kind}.docx", is_draft=True)

    async def fake_download(url, path):
        path.write_bytes(b"new")

    monkeypatch.setattr(oo_api.onlyoffice_service, "download_and_replace", fake_download)

    token = jwt.encode({"status": 6}, "test-secret", algorithm="HS256")
    body = {"status": 6, "url": "http://oo/cache/file.docx", "userdata": save_id, "token": token}
    request = MagicMock()
    request.json = AsyncMock(return_value=body)
    request.headers = {}

    if kind == "notification":
        response = await oo_api.notification_onlyoffice_callback(
            notification_id=1,
            request=request,
            db=cast(AsyncSession, _FakeDB(record)),
            current_user="onlyoffice_server",
        )
    else:
        response = await oo_api.statement_onlyoffice_callback(
            statement_id=1,
            request=request,
            db=cast(AsyncSession, _FakeDB(record)),
            current_user="onlyoffice_server",
        )

    assert response == {"error": 0}
    assert record.is_draft is False
    status = await onlyoffice_save_tracker.get(save_id)
    assert status["state"] == "persisted"
    assert status["oo_status"] == 6
    assert target.read_bytes() == b"new"


# ── save-status endpoint ────────────────────────────────────────────────────


@pytest.mark.parametrize("kind", ["notification", "statement"])
async def test_save_status_endpoint_unknown_pending_persisted(monkeypatch, kind):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    record = SimpleNamespace(id=1, file_path="x.docx", is_draft=False)

    if kind == "notification":
        save_status = oo_api.notification_onlyoffice_save_status
    else:
        save_status = oo_api.statement_onlyoffice_save_status

    unknown = await save_status(
        **_entity_kwargs(kind, 1),
        save_id="nope",
        db=cast(AsyncSession, _FakeDB(record)),
        current_user="admin",
    )
    assert unknown["state"] == "unknown"

    save_id = f"pend-{kind}"
    await onlyoffice_save_tracker.register(save_id, kind, 1)
    pending = await save_status(
        **_entity_kwargs(kind, 1),
        save_id=save_id,
        db=cast(AsyncSession, _FakeDB(record)),
        current_user="admin",
    )
    assert pending["state"] == "pending"

    await onlyoffice_save_tracker.mark_persisted(save_id, oo_status=6, file_mtime=99)
    persisted = await save_status(
        **_entity_kwargs(kind, 1),
        save_id=save_id,
        db=cast(AsyncSession, _FakeDB(record)),
        current_user="admin",
    )
    assert persisted["state"] == "persisted"
    assert persisted["file_mtime"] == 99
    assert persisted["oo_status"] == 6


@pytest.mark.parametrize("kind", ["notification", "statement"])
async def test_save_status_endpoint_missing_entity_404(monkeypatch, kind):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)

    if kind == "notification":
        save_status = oo_api.notification_onlyoffice_save_status
    else:
        save_status = oo_api.statement_onlyoffice_save_status

    with pytest.raises(HRMSException) as exc_info:
        await save_status(
            **_entity_kwargs(kind, 404),
            save_id="sid",
            db=cast(AsyncSession, _FakeDB(None)),
            current_user="admin",
        )
    assert exc_info.value.status_code == 404
