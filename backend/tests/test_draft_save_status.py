"""Tests for persistent per-draft save status (#52).

Covers:
- OrderDraftService.update_save_status / read_save_status round-trip and defaults
- concurrency safety of metadata writes
- draft callback handler wiring (success / download failure / status 7)
- _run_forcesave wiring for draft vs order
- list_order_drafts returning save_status + file info
"""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.services.onlyoffice_save_tracker import onlyoffice_save_tracker
from app.services.order_draft_service import OrderDraftService

DRAFT_ID = "22222222-2222-2222-2222-222222222222"


def _db() -> AsyncSession:
    return cast(AsyncSession, object())


def _make_service(tmp_path) -> OrderDraftService:
    svc = OrderDraftService()
    svc._drafts_dir = tmp_path / ".drafts"
    return svc


@pytest.fixture(autouse=True)
async def _clear_global_tracker():
    await onlyoffice_save_tracker.clear()
    yield
    await onlyoffice_save_tracker.clear()


# ── service: update / read round-trip ───────────────────────────────────────


@pytest.mark.asyncio
async def test_update_save_status_saved(tmp_path):
    svc = _make_service(tmp_path)
    svc.save_draft_metadata(DRAFT_ID, {"draft_id": DRAFT_ID, "kind": "single_order"})

    status = await svc.update_save_status(DRAFT_ID, state="saved")

    assert status["state"] == "saved"
    assert status["last_saved_at"] is not None
    assert status["last_error"] is None
    assert status["last_error_at"] is None

    reread = svc.read_save_status(DRAFT_ID)
    assert reread["state"] == "saved"
    assert reread["last_saved_at"] == status["last_saved_at"]


@pytest.mark.asyncio
async def test_update_save_status_error_keeps_last_saved_at(tmp_path):
    svc = _make_service(tmp_path)
    svc.save_draft_metadata(DRAFT_ID, {"draft_id": DRAFT_ID, "kind": "single_order"})

    await svc.update_save_status(DRAFT_ID, state="saved")
    status = await svc.update_save_status(DRAFT_ID, state="error", error="OnlyOffice недоступен")

    assert status["state"] == "error"
    assert status["last_error"] == "OnlyOffice недоступен"
    assert status["last_error_at"] is not None
    # Последнее успешное сохранение сохраняется — UI покажет «был сохранён, потом ошибка».
    assert status["last_saved_at"] is not None

    reread = svc.read_save_status(DRAFT_ID)
    assert reread["state"] == "error"
    assert reread["last_error"] == "OnlyOffice недоступен"
    assert reread["last_saved_at"] == status["last_saved_at"]


@pytest.mark.asyncio
async def test_update_save_status_error_then_saved_flips_back(tmp_path):
    svc = _make_service(tmp_path)
    svc.save_draft_metadata(DRAFT_ID, {"draft_id": DRAFT_ID, "kind": "single_order"})

    await svc.update_save_status(DRAFT_ID, state="error", error="boom")
    status = await svc.update_save_status(DRAFT_ID, state="saved")

    assert status["state"] == "saved"
    assert status["last_error"] is None
    assert status["last_error_at"] is None


@pytest.mark.asyncio
async def test_read_save_status_defaults_never(tmp_path):
    svc = _make_service(tmp_path)

    # Без файла метаданных вообще
    assert svc.read_save_status(DRAFT_ID)["state"] == "never"

    # Файл есть, но без блока save_status (старый черновик)
    svc.save_draft_metadata(DRAFT_ID, {"draft_id": DRAFT_ID, "kind": "single_order"})
    status = svc.read_save_status(DRAFT_ID)
    assert status["state"] == "never"
    assert status["last_saved_at"] is None
    assert status["last_error"] is None
    assert status["last_error_at"] is None


@pytest.mark.asyncio
async def test_update_save_status_unknown_state_raises(tmp_path):
    svc = _make_service(tmp_path)
    svc.save_draft_metadata(DRAFT_ID, {"draft_id": DRAFT_ID, "kind": "single_order"})
    with pytest.raises(ValueError):
        await svc.update_save_status(DRAFT_ID, state="bogus")


@pytest.mark.asyncio
async def test_update_save_status_missing_metadata_is_noop(tmp_path):
    svc = _make_service(tmp_path)
    status = await svc.update_save_status(DRAFT_ID, state="error", error="boom")
    assert status["state"] == "never"


@pytest.mark.asyncio
async def test_concurrent_save_status_updates_do_not_corrupt(tmp_path):
    svc = _make_service(tmp_path)
    svc.save_draft_metadata(DRAFT_ID, {"draft_id": DRAFT_ID, "kind": "single_order"})

    async def flip(state: str, i: int):
        # Небольшая случайная задержка усиливает шанс пересечения чтения/записи.
        await asyncio.sleep((i % 5) * 0.001)
        await svc.update_save_status(DRAFT_ID, state=state, error=f"err-{i}")

    await asyncio.gather(*[flip("saved", i) for i in range(25)])
    await asyncio.gather(*[flip("error", i) for i in range(25)])

    result = svc.read_save_status(DRAFT_ID)
    assert result["state"] in ("saved", "error")
    if result["state"] == "error":
        assert result["last_error"]

    # Файл остаётся валидным JSON и не «разорван» параллельной записью.
    raw = json.loads(svc.get_metadata_path(DRAFT_ID).read_text(encoding="utf-8"))
    assert raw["save_status"]["state"] == result["state"]


# ── draft callback wiring ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_draft_callback_success_records_saved(monkeypatch, tmp_path):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    draft_path = tmp_path / "draft.docx"
    draft_path.write_bytes(b"old")
    async def fake_download(url, path):
        path.write_bytes(b"new")
    monkeypatch.setattr(oo_api.order_draft_service, "get_draft_path", lambda draft_id: draft_path)
    monkeypatch.setattr(oo_api.onlyoffice_service, "download_and_replace", fake_download)
    spy = AsyncMock()
    monkeypatch.setattr(oo_api.order_draft_service, "update_save_status", spy)

    token = jwt.encode({"status": 2}, "test-secret", algorithm="HS256")
    body = {"status": 2, "url": "http://oo/f.docx", "token": token}
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.draft_onlyoffice_callback(
        draft_id=DRAFT_ID, request=mock_request, current_user="onlyoffice_server"
    )
    assert response == {"error": 0}
    spy.assert_awaited_once_with(DRAFT_ID, state="saved")


@pytest.mark.asyncio
async def test_draft_callback_download_failure_records_error(monkeypatch, tmp_path):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    draft_path = tmp_path / "draft.docx"
    draft_path.write_bytes(b"x")
    async def boom(url, path):
        raise HRMSException("dl failed", "onlyoffice_save_failed", status_code=502)
    monkeypatch.setattr(oo_api.order_draft_service, "get_draft_path", lambda draft_id: draft_path)
    monkeypatch.setattr(oo_api.onlyoffice_service, "download_and_replace", boom)
    spy = AsyncMock()
    monkeypatch.setattr(oo_api.order_draft_service, "update_save_status", spy)

    token = jwt.encode({"status": 6}, "test-secret", algorithm="HS256")
    body = {"status": 6, "url": "http://oo/f.docx", "token": token}
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.draft_onlyoffice_callback(
        draft_id=DRAFT_ID, request=mock_request, current_user="onlyoffice_server"
    )
    from fastapi.responses import JSONResponse
    assert isinstance(response, JSONResponse)
    assert response.status_code == 500
    spy.assert_awaited_once_with(DRAFT_ID, state="error", error="dl failed")


@pytest.mark.asyncio
async def test_draft_callback_status_7_records_error(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    spy = AsyncMock()
    monkeypatch.setattr(oo_api.order_draft_service, "update_save_status", spy)

    token = jwt.encode({"status": 7}, "test-secret", algorithm="HS256")
    body = {"status": 7, "token": token}
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.draft_onlyoffice_callback(
        draft_id=DRAFT_ID, request=mock_request, current_user="onlyoffice_server"
    )
    assert response == {"error": 0}
    spy.assert_awaited_once_with(DRAFT_ID, state="error", error="forcesave_callback_status_7")


@pytest.mark.asyncio
async def test_draft_callback_status_3_no_url_records_error(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    spy = AsyncMock()
    monkeypatch.setattr(oo_api.order_draft_service, "update_save_status", spy)

    token = jwt.encode({"status": 3}, "test-secret", algorithm="HS256")
    body = {"status": 3, "token": token}
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.draft_onlyoffice_callback(
        draft_id=DRAFT_ID, request=mock_request, current_user="onlyoffice_server"
    )
    assert response == {"error": 0}
    spy.assert_awaited_once_with(DRAFT_ID, state="error", error="forcesave_callback_status_3_no_url")


# ── _run_forcesave wiring ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_forcesave_draft_failure_records_error(monkeypatch):
    from app.api import onlyoffice as oo_api

    async def fake_force_save(key, userdata=None):
        raise HRMSException("OnlyOffice недоступен", "onlyoffice_forcesave_failed", status_code=502)

    monkeypatch.setattr(oo_api.onlyoffice_service, "force_save", fake_force_save)
    spy = AsyncMock()
    monkeypatch.setattr(oo_api.order_draft_service, "update_save_status", spy)

    with pytest.raises(HRMSException):
        await oo_api._run_forcesave(f"draft-{DRAFT_ID}-1", "sid-x", "draft", DRAFT_ID)

    spy.assert_awaited_once_with(DRAFT_ID, state="error", error="OnlyOffice недоступен")


@pytest.mark.asyncio
async def test_run_forcesave_order_failure_does_not_record_draft_status(monkeypatch):
    from app.api import onlyoffice as oo_api

    async def fake_force_save(key, userdata=None):
        raise HRMSException("fail", "onlyoffice_forcesave_failed", status_code=502)

    monkeypatch.setattr(oo_api.onlyoffice_service, "force_save", fake_force_save)
    spy = AsyncMock()
    monkeypatch.setattr(oo_api.order_draft_service, "update_save_status", spy)

    with pytest.raises(HRMSException):
        await oo_api._run_forcesave("order-1-x", "sid-y", "order", 1)

    spy.assert_not_awaited()


@pytest.mark.asyncio
async def test_run_forcesave_draft_no_changes_does_not_record_error(monkeypatch):
    from app.api import onlyoffice as oo_api

    async def fake_force_save(key, userdata=None):
        return 4

    monkeypatch.setattr(oo_api.onlyoffice_service, "force_save", fake_force_save)
    spy = AsyncMock()
    monkeypatch.setattr(oo_api.order_draft_service, "update_save_status", spy)

    result = await oo_api._run_forcesave(f"draft-{DRAFT_ID}-1", "sid-nc", "draft", DRAFT_ID)
    assert result["message"] == "no_changes"
    spy.assert_not_awaited()


# ── list endpoint ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_draft_save_report_records_error(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(
        oo_api.order_draft_service,
        "get_draft_path",
        lambda draft_id: SimpleNamespace(name="x.docx"),
    )
    spy = AsyncMock()
    monkeypatch.setattr(oo_api.order_draft_service, "update_save_status", spy)

    resp = await oo_api.draft_onlyoffice_save_report(
        draft_id=DRAFT_ID,
        data=SimpleNamespace(reason="Таймаут ожидания сохранения"),
        current_user="admin",
    )
    assert resp == {"message": "ok"}
    spy.assert_awaited_once_with(DRAFT_ID, state="error", error="Таймаут ожидания сохранения")


@pytest.mark.asyncio
async def test_draft_save_report_validates_reason(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(
        oo_api.order_draft_service,
        "get_draft_path",
        lambda draft_id: SimpleNamespace(name="x.docx"),
    )
    spy = AsyncMock()
    monkeypatch.setattr(oo_api.order_draft_service, "update_save_status", spy)

    resp = await oo_api.draft_onlyoffice_save_report(
        draft_id=DRAFT_ID,
        data=SimpleNamespace(reason="   "),
        current_user="admin",
    )
    assert resp == {"message": "ok"}
    # Пустая причина не должна перезаписывать статус.
    spy.assert_not_awaited()


@pytest.mark.asyncio
async def test_list_order_drafts_includes_save_status_and_file(monkeypatch, tmp_path):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)

    meta = {
        "draft_id": DRAFT_ID,
        "kind": "single_order",
        "order_type_code": None,
        "payload": {"order_number": "42", "order_date": "2026-01-01", "employee_id": None},
        "created_by": "admin",
        "created_at": "2026-01-01T00:00:00+00:00",
        "status": "draft",
        "save_status": {
            "state": "error",
            "last_saved_at": "2026-01-02T00:00:00+00:00",
            "last_error": "boom",
            "last_error_at": "2026-01-03T00:00:00+00:00",
        },
    }
    monkeypatch.setattr(oo_api.order_draft_service, "list_drafts", lambda: [meta])
    draft_path = tmp_path / f"{DRAFT_ID}_Приказ №42.docx"
    draft_path.write_bytes(b"x")
    monkeypatch.setattr(oo_api.order_draft_service, "get_draft_path", lambda draft_id: draft_path)

    items = await oo_api.list_order_drafts(db=_db(), current_user="admin")
    assert len(items) == 1
    item = items[0]
    assert item["save_status"]["state"] == "error"
    assert item["save_status"]["last_error"] == "boom"
    assert item["file_name"] == f"{DRAFT_ID}_Приказ №42.docx"
    assert item["file_path"] == str(draft_path)
    assert item["status"] == "draft"


@pytest.mark.asyncio
async def test_list_order_drafts_defaults_never_for_old_metadata(monkeypatch, tmp_path):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)

    meta = {
        "draft_id": DRAFT_ID,
        "kind": "single_order",
        "order_type_code": None,
        "payload": {"order_number": "1", "employee_id": None},
        "created_by": "admin",
        "created_at": "2026-01-01T00:00:00+00:00",
        "status": "draft",
    }
    monkeypatch.setattr(oo_api.order_draft_service, "list_drafts", lambda: [meta])
    draft_path = tmp_path / f"{DRAFT_ID}_draft.docx"
    draft_path.write_bytes(b"x")
    monkeypatch.setattr(oo_api.order_draft_service, "get_draft_path", lambda draft_id: draft_path)

    items = await oo_api.list_order_drafts(db=_db(), current_user="admin")
    assert items[0]["save_status"]["state"] == "never"
    assert items[0]["save_status"]["last_saved_at"] is None
    assert items[0]["file_name"] == f"{DRAFT_ID}_draft.docx"


@pytest.mark.asyncio
async def test_list_order_drafts_handles_missing_file(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)

    meta = {
        "draft_id": DRAFT_ID,
        "kind": "single_order",
        "order_type_code": None,
        "payload": {"order_number": "1", "employee_id": None},
        "created_by": "admin",
        "created_at": "2026-01-01T00:00:00+00:00",
        "status": "draft",
    }
    monkeypatch.setattr(oo_api.order_draft_service, "list_drafts", lambda: [meta])
    monkeypatch.setattr(
        oo_api.order_draft_service,
        "get_draft_path",
        lambda draft_id: (_ for _ in ()).throw(HRMSException("нет", "draft_not_found", status_code=404)),
    )

    items = await oo_api.list_order_drafts(db=_db(), current_user="admin")
    assert items[0]["file_name"] is None
    assert items[0]["file_path"] is None
    assert items[0]["save_status"]["state"] == "never"
