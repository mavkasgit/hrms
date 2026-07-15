"""Tests for OnlyOffice forcesave save_id tracking (CP2→CP3)."""

from __future__ import annotations

import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from jose import jwt

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.services.onlyoffice_save_tracker import OnlyOfficeSaveTracker, onlyoffice_save_tracker
from app.services.onlyoffice_service import OnlyOfficeService


@pytest.fixture(autouse=True)
async def _clear_global_tracker():
    await onlyoffice_save_tracker.clear()
    yield
    await onlyoffice_save_tracker.clear()


# ── tracker unit tests ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_save_tracker_register_get_pending():
    tracker = OnlyOfficeSaveTracker()
    await tracker.register("sid-1", "order", 12)
    status = await tracker.get("sid-1")
    assert status["state"] == "pending"
    assert status["save_id"] == "sid-1"
    assert status["oo_status"] is None
    assert status["file_mtime"] is None
    assert status["error"] is None


@pytest.mark.asyncio
async def test_save_tracker_unknown():
    tracker = OnlyOfficeSaveTracker()
    status = await tracker.get("never-registered")
    assert status["state"] == "unknown"
    assert status["save_id"] == "never-registered"


@pytest.mark.asyncio
async def test_save_tracker_mark_persisted_and_failed():
    tracker = OnlyOfficeSaveTracker()
    await tracker.register("sid-p", "order", 1)
    await tracker.mark_persisted("sid-p", oo_status=6, file_mtime=1710000000)
    status = await tracker.get("sid-p")
    assert status["state"] == "persisted"
    assert status["oo_status"] == 6
    assert status["file_mtime"] == 1710000000

    await tracker.register("sid-f", "draft", "abc")
    await tracker.mark_failed("sid-f", "forcesave_callback_status_7", oo_status=7)
    status = await tracker.get("sid-f")
    assert status["state"] == "failed"
    assert status["error"] == "forcesave_callback_status_7"
    assert status["oo_status"] == 7


@pytest.mark.asyncio
async def test_save_tracker_mark_no_changes():
    tracker = OnlyOfficeSaveTracker()
    await tracker.register("sid-nc", "order", 1)
    await tracker.mark_no_changes("sid-nc")
    status = await tracker.get("sid-nc")
    assert status["state"] == "no_changes"


@pytest.mark.asyncio
async def test_save_tracker_expire():
    tracker = OnlyOfficeSaveTracker(ttl_seconds=1)
    await tracker.register("sid-old", "order", 1)
    # Force created_at into the past
    async with tracker._lock:
        tracker._attempts["sid-old"]["created_at"] = time.time() - 5
    status = await tracker.get("sid-old")
    assert status["state"] == "unknown"


# ── force_save error mapping ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_force_save_returns_error_4_no_changes(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "ONLYOFFICE_INTERNAL_URL", "http://oo-internal")
    monkeypatch.setattr(settings, "ONLYOFFICE_PUBLIC_URL", "")
    monkeypatch.setattr(settings, "DOCUMENT_GENERATION_TIMEOUT", 5)

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"error": 4}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, json=None, headers=None):
            self.last_json = json
            return FakeResponse()

    with patch("app.services.onlyoffice_service.httpx.AsyncClient", FakeClient):
        result = await OnlyOfficeService().force_save("order-1-123-edit", userdata="save-uuid")

    assert result == 4


@pytest.mark.asyncio
async def test_force_save_success_with_userdata_in_body(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "ONLYOFFICE_INTERNAL_URL", "http://oo-internal")
    monkeypatch.setattr(settings, "ONLYOFFICE_PUBLIC_URL", "")
    monkeypatch.setattr(settings, "DOCUMENT_GENERATION_TIMEOUT", 5)

    captured: dict = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"error": 0}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, json=None, headers=None):
            captured["json"] = json
            return FakeResponse()

    with patch("app.services.onlyoffice_service.httpx.AsyncClient", FakeClient):
        result = await OnlyOfficeService().force_save("order-1-123-edit", userdata="550e8400")

    assert result == 0
    assert captured["json"]["c"] == "forcesave"
    assert captured["json"]["key"] == "order-1-123-edit"
    assert captured["json"]["userdata"] == "550e8400"


@pytest.mark.asyncio
async def test_force_save_other_error_raises(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "ONLYOFFICE_INTERNAL_URL", "http://oo-internal")
    monkeypatch.setattr(settings, "ONLYOFFICE_PUBLIC_URL", "")
    monkeypatch.setattr(settings, "DOCUMENT_GENERATION_TIMEOUT", 5)

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"error": 1}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, json=None, headers=None):
            return FakeResponse()

    with patch("app.services.onlyoffice_service.httpx.AsyncClient", FakeClient):
        with pytest.raises(HRMSException) as exc_info:
            await OnlyOfficeService().force_save("order-1-123-edit")
    assert exc_info.value.error_code == "onlyoffice_forcesave_failed"
    assert exc_info.value.status_code == 502


# ── _run_forcesave mapping ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_forcesave_no_changes_maps_to_response(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    await onlyoffice_save_tracker.clear()

    async def fake_force_save(key, userdata=None):
        return 4

    monkeypatch.setattr(oo_api.onlyoffice_service, "force_save", fake_force_save)

    result = await oo_api._run_forcesave("order-1-x-edit", "sid-nc", "order", 1)
    assert result["message"] == "no_changes"
    assert result["command_error"] == 4
    assert result["save_id"] == "sid-nc"
    status = await onlyoffice_save_tracker.get("sid-nc")
    assert status["state"] == "no_changes"


@pytest.mark.asyncio
async def test_run_forcesave_success_pending(monkeypatch):
    from app.api import onlyoffice as oo_api

    async def fake_force_save(key, userdata=None):
        return 0

    monkeypatch.setattr(oo_api.onlyoffice_service, "force_save", fake_force_save)

    result = await oo_api._run_forcesave("order-1-x-edit", "sid-ok", "order", 1)
    assert result["message"] == "save_requested"
    assert result["command_error"] is None
    status = await onlyoffice_save_tracker.get("sid-ok")
    assert status["state"] == "pending"


@pytest.mark.asyncio
async def test_run_forcesave_without_save_id_still_works(monkeypatch):
    from app.api import onlyoffice as oo_api

    async def fake_force_save(key, userdata=None):
        assert userdata is None
        return None

    monkeypatch.setattr(oo_api.onlyoffice_service, "force_save", fake_force_save)

    result = await oo_api._run_forcesave("order-1-x-edit", None, "order", 1)
    assert result["message"] == "save_requested"
    assert result["save_id"] is None


@pytest.mark.asyncio
async def test_run_forcesave_failure_marks_failed(monkeypatch):
    from app.api import onlyoffice as oo_api

    async def fake_force_save(key, userdata=None):
        raise HRMSException("fail", "onlyoffice_forcesave_failed", status_code=502)

    monkeypatch.setattr(oo_api.onlyoffice_service, "force_save", fake_force_save)

    with pytest.raises(HRMSException):
        await oo_api._run_forcesave("order-1-x-edit", "sid-fail", "order", 1)

    status = await onlyoffice_save_tracker.get("sid-fail")
    assert status["state"] == "failed"
    assert status["error"] == "onlyoffice_forcesave_failed"


# ── callback tracking ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_order_callback_userdata_marks_persisted(monkeypatch, tmp_path):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    save_id = "cb-persisted-1"
    await onlyoffice_save_tracker.register(save_id, "order", 42)

    target = tmp_path / "order.docx"
    target.write_bytes(b"old-content")

    order = SimpleNamespace(file_path="order.docx")

    async def fake_get_by_id(db, order_id):
        return order

    async def fake_download(url, path):
        path.write_bytes(b"new-content")

    monkeypatch.setattr(oo_api.order_service, "get_by_id", fake_get_by_id)
    monkeypatch.setattr(oo_api.onlyoffice_service, "download_and_replace", fake_download)
    monkeypatch.setattr(oo_api, "storage_path", lambda *a, **k: target)

    token = jwt.encode({"status": 6}, "test-secret", algorithm="HS256")
    body = {"status": 6, "url": "http://oo/cache/file.docx", "userdata": save_id, "token": token}

    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.order_onlyoffice_callback(
        order_id=42, request=mock_request, db=object(), current_user="onlyoffice_server"
    )
    assert response == {"error": 0}

    status = await onlyoffice_save_tracker.get(save_id)
    assert status["state"] == "persisted"
    assert status["oo_status"] == 6
    assert status["file_mtime"] is not None
    assert target.read_bytes() == b"new-content"


@pytest.mark.asyncio
async def test_order_callback_status_7_marks_failed(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    save_id = "cb-fail-7"
    await onlyoffice_save_tracker.register(save_id, "order", 1)

    token = jwt.encode({"status": 7}, "test-secret", algorithm="HS256")
    body = {"status": 7, "userdata": save_id, "token": token}

    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.order_onlyoffice_callback(
        order_id=1, request=mock_request, db=object(), current_user="onlyoffice_server"
    )
    assert response == {"error": 0}

    status = await onlyoffice_save_tracker.get(save_id)
    assert status["state"] == "failed"
    assert status["error"] == "forcesave_callback_status_7"
    assert status["oo_status"] == 7


@pytest.mark.asyncio
async def test_draft_callback_download_failure_returns_error_1(monkeypatch, tmp_path):
    from app.api import onlyoffice as oo_api
    from fastapi.responses import JSONResponse

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    save_id = "draft-cb-fail"
    await onlyoffice_save_tracker.register(save_id, "draft", "d1")

    draft_path = tmp_path / "draft.docx"
    draft_path.write_bytes(b"x")

    async def boom(url, path):
        raise HRMSException("dl failed", "onlyoffice_save_failed", status_code=502)

    monkeypatch.setattr(oo_api.order_draft_service, "get_draft_path", lambda draft_id: draft_path)
    monkeypatch.setattr(oo_api.onlyoffice_service, "download_and_replace", boom)

    token = jwt.encode({"status": 6}, "test-secret", algorithm="HS256")
    body = {"status": 6, "url": "http://oo/file.docx", "userdata": save_id, "token": token}

    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.draft_onlyoffice_callback(
        draft_id="d1", request=mock_request, current_user="onlyoffice_server"
    )
    assert isinstance(response, JSONResponse)
    assert response.status_code == 500
    assert response.body  # has error payload

    status = await onlyoffice_save_tracker.get(save_id)
    assert status["state"] == "failed"


@pytest.mark.asyncio
async def test_draft_callback_success_marks_persisted(monkeypatch, tmp_path):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    save_id = "draft-cb-ok"
    await onlyoffice_save_tracker.register(save_id, "draft", "d2")
    draft_path = tmp_path / "draft.docx"
    draft_path.write_bytes(b"old")

    async def fake_download(url, path):
        path.write_bytes(b"saved")

    monkeypatch.setattr(oo_api.order_draft_service, "get_draft_path", lambda draft_id: draft_path)
    monkeypatch.setattr(oo_api.onlyoffice_service, "download_and_replace", fake_download)

    token = jwt.encode({"status": 2}, "test-secret", algorithm="HS256")
    body = {"status": 2, "url": "http://oo/file.docx", "userdata": save_id, "token": token}

    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}

    response = await oo_api.draft_onlyoffice_callback(
        draft_id="d2", request=mock_request, current_user="onlyoffice_server"
    )
    assert response == {"error": 0}
    status = await onlyoffice_save_tracker.get(save_id)
    assert status["state"] == "persisted"
    assert status["oo_status"] == 2


# ── save-status endpoint helpers via tracker (light API-level) ──────────────


@pytest.mark.asyncio
async def test_save_status_endpoint_unknown_pending_persisted(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)

    async def fake_get_by_id(db, order_id):
        return SimpleNamespace(id=order_id, file_path="x.docx")

    monkeypatch.setattr(oo_api.order_service, "get_by_id", fake_get_by_id)

    unknown = await oo_api.order_onlyoffice_save_status(
        order_id=1, save_id="nope", db=object(), current_user="admin"
    )
    assert unknown["state"] == "unknown"

    await onlyoffice_save_tracker.register("pend-1", "order", 1)
    pending = await oo_api.order_onlyoffice_save_status(
        order_id=1, save_id="pend-1", db=object(), current_user="admin"
    )
    assert pending["state"] == "pending"

    await onlyoffice_save_tracker.mark_persisted("pend-1", oo_status=6, file_mtime=99)
    persisted = await oo_api.order_onlyoffice_save_status(
        order_id=1, save_id="pend-1", db=object(), current_user="admin"
    )
    assert persisted["state"] == "persisted"
    assert persisted["file_mtime"] == 99
    assert persisted["oo_status"] == 6
