"""Tests for OnlyOfficeCallbackPipeline (ADR-0006).

Покрытие: normalize_onlyoffice_callback_status, handle_callback (IGNORE /
FAILED / PERSISTED, target-none, download, persistence),
request_forcesave (no_changes / save_requested / HRMSException), корреляция
userdata=None → трекер не трогается и единый HTTP-маппинг роутера
(http_error=0 → 200 error:0, http_error=1 → 500 error:1). Двойники:
FakeDownloader, FakeCommandClient, FakeTracker, FakeStrategy.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.responses import JSONResponse
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.services.onlyoffice_callback_pipeline import (
    BUILTIN_STRATEGIES,
    CallbackContext,
    CallbackKind,
    CallbackResult,
    OnlyOfficeCallbackPipeline,
    PhysicalOutcome,
    normalize_onlyoffice_callback_status,
    onlyoffice_callback_pipeline,
)


def _db() -> AsyncSession:
    return cast(AsyncSession, object())


def _context(
    kind: CallbackKind = CallbackKind.ORDER,
    entity_id: str | int = 1,
    db: Any = None,
    userdata: str | None = None,
) -> CallbackContext:
    return CallbackContext(kind=kind, entity_id=entity_id, db=db, userdata=userdata)


class FakeDownloader:
    def __init__(self, exc: Exception | None = None):
        self.exc = exc
        self.calls: list[tuple[str, Path]] = []

    async def download_and_replace(self, url: str, target: Path) -> None:
        self.calls.append((url, target))
        if self.exc is not None:
            raise self.exc
        target.write_bytes(b"new")


class FakeCommandClient:
    def __init__(self, result: int | None = None, exc: Exception | None = None):
        self.result = result
        self.exc = exc
        self.calls: list[tuple[str, str | None]] = []

    async def force_save(self, document_key: str, userdata: str | None = None) -> int | None:
        self.calls.append((document_key, userdata))
        if self.exc is not None:
            raise self.exc
        return self.result


class FakeTracker:
    def __init__(self, events: list[str] | None = None):
        self.events = events if events is not None else []
        self.calls: list[tuple[str, Any]] = []

    def _record(self, event: str, *args: Any) -> None:
        self.calls.append((event, *args))
        self.events.append(event)

    async def register(self, save_id: str, doc_type: str, doc_id: str | int) -> None:
        self._record("register", save_id, doc_type, doc_id)

    async def mark_persisted(self, save_id: str, oo_status: int | None, file_mtime: int | float | None) -> None:
        self._record("mark_persisted", save_id, oo_status, file_mtime)

    async def mark_failed(self, save_id: str, error: str, oo_status: int | None = None) -> None:
        self._record("mark_failed", save_id, error, oo_status)

    async def mark_no_changes(self, save_id: str) -> None:
        self._record("mark_no_changes", save_id)


class FakeStrategy:
    def __init__(
        self,
        target: Any = None,
        events: list[str] | None = None,
        apply_persisted_exc: Exception | None = None,
    ):
        self.target = target
        self.events = events if events is not None else []
        self.apply_persisted_exc = apply_persisted_exc
        self.calls: list[tuple[Any, ...]] = []

    async def resolve_target(self, context: CallbackContext) -> Any:
        self.calls.append(("resolve_target", context))
        return self.target

    async def apply_persisted(self, context: CallbackContext, target: Any) -> None:
        self.calls.append(("apply_persisted", context, target))
        self.events.append("apply_persisted")
        if self.apply_persisted_exc is not None:
            raise self.apply_persisted_exc

    async def apply_failed(self, context: CallbackContext, error: str) -> None:
        self.calls.append(("apply_failed", context, error))

    async def apply_forcesave_failed(self, context: CallbackContext, error: str) -> None:
        self.calls.append(("apply_forcesave_failed", context, error))


def _make_pipeline(downloader: FakeDownloader, command_client: FakeCommandClient, tracker: FakeTracker, strategy: FakeStrategy):
    strategies = {kind: strategy for kind in CallbackKind}
    return OnlyOfficeCallbackPipeline(
        downloader=downloader,
        command_client=command_client,
        strategies=strategies,
        tracker=tracker,
    )


def _call_by_name(calls: list[tuple[Any, ...]], name: str) -> tuple[Any, ...]:
    return next(call for call in calls if call[0] == name)


# ── normalize_onlyoffice_callback_status ────────────────────────────────────


@pytest.mark.parametrize(
    ("status", "url", "expected_kind"),
    [
        (2, "http://oo/f.docx", PhysicalOutcome.PERSISTED),
        (6, "http://oo/f.docx", PhysicalOutcome.PERSISTED),
        (3, "http://oo/f.docx", PhysicalOutcome.FAILED),
        (3, None, PhysicalOutcome.FAILED),
        (7, None, PhysicalOutcome.FAILED),
        (7, "http://oo/f.docx", PhysicalOutcome.FAILED),
        (2, None, PhysicalOutcome.FAILED),
        (6, None, PhysicalOutcome.FAILED),
        (4, None, PhysicalOutcome.IGNORE),
        (1, None, PhysicalOutcome.IGNORE),
        ("garbage", None, PhysicalOutcome.IGNORE),
    ],
)
def test_normalize_onlyoffice_callback_status(status, url, expected_kind):
    body = {"status": status}
    if url is not None:
        body["url"] = url
    assert normalize_onlyoffice_callback_status(body).kind == expected_kind


def test_normalize_status_carries_url_and_errors():
    persisted = normalize_onlyoffice_callback_status({"status": 2, "url": "http://oo/f.docx"})
    assert persisted.url == "http://oo/f.docx"
    assert persisted.oo_status == 2

    no_url = normalize_onlyoffice_callback_status({"status": 2})
    assert no_url.error == "no_url_for_save_status"
    assert no_url.oo_status == 2

    assert normalize_onlyoffice_callback_status({"status": 3}).error == "forcesave_callback_status_3_no_url"
    assert normalize_onlyoffice_callback_status({"status": 7}).error == "forcesave_callback_status_7"
    assert normalize_onlyoffice_callback_status({"status": 4}).oo_status == 4


# ── handle_callback: IGNORE ─────────────────────────────────────────────────


async def test_handle_callback_ignore_touches_nothing():
    strategy = FakeStrategy()
    tracker = FakeTracker()
    pipeline = _make_pipeline(FakeDownloader(), FakeCommandClient(), tracker, strategy)

    result = await pipeline.handle_callback(_context(), {"status": 4})

    assert result.physical == PhysicalOutcome.IGNORE
    assert result.http_error == 0
    assert strategy.calls == []
    assert tracker.calls == []


async def test_handle_callback_ignore_even_with_userdata():
    strategy = FakeStrategy()
    tracker = FakeTracker()
    pipeline = _make_pipeline(FakeDownloader(), FakeCommandClient(), tracker, strategy)

    result = await pipeline.handle_callback(_context(userdata="sid-ignore"), {"status": 1, "userdata": "sid-ignore"})

    assert result.physical == PhysicalOutcome.IGNORE
    assert result.http_error == 0
    assert strategy.calls == []
    assert tracker.calls == []


# ── handle_callback: FAILED ─────────────────────────────────────────────────


async def test_handle_callback_failed_applies_failed_and_marks_tracker():
    strategy = FakeStrategy()
    tracker = FakeTracker()
    pipeline = _make_pipeline(FakeDownloader(), FakeCommandClient(), tracker, strategy)

    result = await pipeline.handle_callback(_context(userdata="sid-7"), {"status": 7, "userdata": "sid-7"})

    assert result.physical == PhysicalOutcome.FAILED
    assert result.http_error == 0
    assert strategy.calls[0][0] == "apply_failed"
    assert strategy.calls[0][2] == "forcesave_callback_status_7"
    assert tracker.calls == [("mark_failed", "sid-7", "forcesave_callback_status_7", 7)]


async def test_handle_callback_failed_skips_tracker_without_userdata():
    strategy = FakeStrategy()
    tracker = FakeTracker()
    pipeline = _make_pipeline(FakeDownloader(), FakeCommandClient(), tracker, strategy)

    result = await pipeline.handle_callback(_context(userdata=None), {"status": 3})

    assert result.physical == PhysicalOutcome.FAILED
    assert result.http_error == 0
    assert strategy.calls[0][0] == "apply_failed"
    assert strategy.calls[0][2] == "forcesave_callback_status_3_no_url"
    assert tracker.calls == []


# ── handle_callback: PERSISTED ──────────────────────────────────────────────


async def test_handle_callback_persisted_download_success(tmp_path):
    events: list[str] = []
    target_path = tmp_path / "f.docx"
    target_path.write_bytes(b"old")
    strategy = FakeStrategy(target=SimpleNamespace(path=target_path), events=events)
    tracker = FakeTracker(events=events)
    downloader = FakeDownloader()
    pipeline = _make_pipeline(downloader, FakeCommandClient(), tracker, strategy)

    result = await pipeline.handle_callback(
        _context(userdata="sid-ok"), {"status": 6, "url": "http://oo/f.docx", "userdata": "sid-ok"}
    )

    assert result.physical == PhysicalOutcome.PERSISTED
    assert result.http_error == 0
    assert downloader.calls == [("http://oo/f.docx", target_path)]
    assert target_path.read_bytes() == b"new"
    assert _call_by_name(strategy.calls, "apply_persisted")[0] == "apply_persisted"
    assert events == ["apply_persisted", "mark_persisted"]
    assert tracker.calls[0] == ("mark_persisted", "sid-ok", 6, int(target_path.stat().st_mtime))


async def test_handle_callback_download_exception_returns_error_1(tmp_path):
    strategy = FakeStrategy(target=SimpleNamespace(path=tmp_path / "f.docx"))
    tracker = FakeTracker()
    downloader = FakeDownloader(exc=HRMSException("dl failed", "onlyoffice_save_failed", status_code=502))
    pipeline = _make_pipeline(downloader, FakeCommandClient(), tracker, strategy)

    result = await pipeline.handle_callback(
        _context(userdata="sid-dl"), {"status": 6, "url": "http://oo/f.docx", "userdata": "sid-dl"}
    )

    assert result.physical == PhysicalOutcome.FAILED
    assert result.http_error == 1
    assert result.error == "dl failed"
    assert _call_by_name(strategy.calls, "apply_failed")[2] == "dl failed"
    assert tracker.calls[0] == ("mark_failed", "sid-dl", "dl failed", 6)


async def test_handle_callback_apply_persisted_raises_keeps_persisted(tmp_path):
    events: list[str] = []
    target_path = tmp_path / "f.docx"
    target_path.write_bytes(b"new")
    strategy = FakeStrategy(
        target=SimpleNamespace(path=target_path),
        events=events,
        apply_persisted_exc=RuntimeError("commit boom"),
    )
    tracker = FakeTracker(events=events)
    pipeline = _make_pipeline(FakeDownloader(), FakeCommandClient(), tracker, strategy)

    result = await pipeline.handle_callback(
        _context(userdata="sid-apply"), {"status": 2, "url": "http://oo/f.docx", "userdata": "sid-apply"}
    )

    assert result.physical == PhysicalOutcome.PERSISTED
    assert result.http_error == 1
    assert result.error == "commit boom"
    assert target_path.read_bytes() == b"new"
    assert events == ["apply_persisted", "mark_persisted"]
    assert tracker.calls[0] == ("mark_persisted", "sid-apply", 2, int(target_path.stat().st_mtime))


async def test_handle_callback_target_not_found_acks():
    strategy = FakeStrategy(target=None)
    tracker = FakeTracker()
    pipeline = _make_pipeline(FakeDownloader(), FakeCommandClient(), tracker, strategy)

    result = await pipeline.handle_callback(
        _context(userdata="sid-tnf"), {"status": 2, "url": "http://oo/f.docx", "userdata": "sid-tnf"}
    )

    assert result.physical == PhysicalOutcome.FAILED
    assert result.http_error == 0
    assert result.error == "target_not_found"
    assert _call_by_name(strategy.calls, "apply_failed")[2] == "target_not_found"
    assert tracker.calls == [("mark_failed", "sid-tnf", "target_not_found", 2)]


async def test_order_draft_strategy_missing_draft_returns_none(monkeypatch):
    from app.core.exceptions import HRMSException
    from app.services.onlyoffice_callback_pipeline import OrderDraftStrategy
    from app.services.order_draft_service import order_draft_service as ods

    def boom(draft_id):
        raise HRMSException("нет", "draft_not_found", status_code=404)

    monkeypatch.setattr(ods, "get_draft_path", boom)

    strategy = OrderDraftStrategy()
    context = _context(kind=CallbackKind.ORDER_DRAFT, entity_id="d-missing", userdata="sid")
    assert await strategy.resolve_target(context) is None


async def test_handle_callback_persisted_without_userdata_skips_tracker(tmp_path):
    target_path = tmp_path / "f.docx"
    target_path.write_bytes(b"old")
    strategy = FakeStrategy(target=SimpleNamespace(path=target_path))
    tracker = FakeTracker()
    pipeline = _make_pipeline(FakeDownloader(), FakeCommandClient(), tracker, strategy)

    result = await pipeline.handle_callback(_context(userdata=None), {"status": 6, "url": "http://oo/f.docx"})

    assert result.physical == PhysicalOutcome.PERSISTED
    assert result.http_error == 0
    assert tracker.calls == []


# ── HTTP-маппинг роутера (единый для всех видов) ───────────────────────────


async def _router_request(body: dict[str, Any]):
    mock_request = MagicMock()
    mock_request.json = AsyncMock(return_value=body)
    mock_request.headers = {}
    return mock_request


def _router_body(status: int = 2, url: str = "http://oo/f.docx") -> dict[str, Any]:
    return {
        "status": status,
        "url": url,
        "token": jwt.encode({"status": status}, "test-secret", algorithm="HS256"),
    }


@pytest.mark.parametrize(
    "kind",
    [
        CallbackKind.ORDER,
        CallbackKind.ORDER_DRAFT,
        CallbackKind.NOTIFICATION,
        CallbackKind.STATEMENT,
    ],
)
async def test_router_mapping_http_error_1_returns_500_for_all_kinds(monkeypatch, kind):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    result = CallbackResult(PhysicalOutcome.FAILED, 1, error="dl failed")

    async def fake_handle(context, body):
        return result

    monkeypatch.setattr(oo_api.onlyoffice_callback_pipeline, "handle_callback", fake_handle)

    body = _router_body()
    request = await _router_request(body)
    if kind == CallbackKind.ORDER:
        response = await oo_api.order_onlyoffice_callback(
            order_id=1, request=request, db=_db(), current_user="onlyoffice_server"
        )
    elif kind == CallbackKind.ORDER_DRAFT:
        response = await oo_api.draft_onlyoffice_callback(
            draft_id="d1", request=request, current_user="onlyoffice_server"
        )
    elif kind == CallbackKind.NOTIFICATION:
        response = await oo_api.notification_onlyoffice_callback(
            notification_id=1, request=request, db=_db(), current_user="onlyoffice_server"
        )
    else:
        response = await oo_api.statement_onlyoffice_callback(
            statement_id=1, request=request, db=_db(), current_user="onlyoffice_server"
        )

    assert isinstance(response, JSONResponse)
    assert response.status_code == 500
    payload = json.loads(bytes(response.body))
    assert payload["error"] == 1
    assert payload["message"] == "dl failed"


async def test_router_mapping_http_error_0_returns_200_error_0(monkeypatch):
    from app.api import onlyoffice as oo_api

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    result = CallbackResult(PhysicalOutcome.PERSISTED, 0)

    async def fake_handle(context, body):
        return result

    monkeypatch.setattr(oo_api.onlyoffice_callback_pipeline, "handle_callback", fake_handle)

    body = _router_body()
    response = await oo_api.notification_onlyoffice_callback(
        notification_id=1,
        request=await _router_request(body),
        db=_db(),
        current_user="onlyoffice_server",
    )

    assert response == {"error": 0}


# ── request_forcesave ───────────────────────────────────────────────────────


async def test_request_forcesave_no_changes():
    tracker = FakeTracker()
    client = FakeCommandClient(result=4)
    strategy = FakeStrategy()
    pipeline = _make_pipeline(FakeDownloader(), client, tracker, strategy)

    result = await pipeline.request_forcesave(_context(userdata="sid-nc"), "order-1-x")

    assert result == {"message": "no_changes", "save_id": "sid-nc", "command_error": 4}
    assert tracker.calls == [("register", "sid-nc", "order", "1"), ("mark_no_changes", "sid-nc")]


async def test_request_forcesave_save_requested():
    tracker = FakeTracker()
    client = FakeCommandClient(result=0)
    pipeline = _make_pipeline(FakeDownloader(), client, tracker, FakeStrategy())

    result = await pipeline.request_forcesave(_context(userdata="sid-ok"), "order-1-x")

    assert result == {"message": "save_requested", "save_id": "sid-ok", "command_error": None}
    assert tracker.calls == [("register", "sid-ok", "order", "1")]


async def test_request_forcesave_command_none_is_save_requested():
    tracker = FakeTracker()
    client = FakeCommandClient(result=None)
    pipeline = _make_pipeline(FakeDownloader(), client, tracker, FakeStrategy())

    result = await pipeline.request_forcesave(_context(userdata="sid-none"), "order-1-x")

    assert result["message"] == "save_requested"
    assert result["command_error"] is None
    assert tracker.calls == [("register", "sid-none", "order", "1")]


async def test_request_forcesave_hrms_exception_marks_failed_and_raises():
    tracker = FakeTracker()
    client = FakeCommandClient(exc=HRMSException("oo down", "onlyoffice_forcesave_failed", status_code=502))
    strategy = FakeStrategy()
    pipeline = _make_pipeline(FakeDownloader(), client, tracker, strategy)

    with pytest.raises(HRMSException) as exc_info:
        await pipeline.request_forcesave(_context(userdata="sid-fail"), "order-1-x")

    assert exc_info.value.error_code == "onlyoffice_forcesave_failed"
    assert tracker.calls == [
        ("register", "sid-fail", "order", "1"),
        ("mark_failed", "sid-fail", "onlyoffice_forcesave_failed", None),
    ]
    assert strategy.calls[0][0] == "apply_forcesave_failed"
    assert strategy.calls[0][2] == "oo down"


async def test_request_forcesave_without_userdata_skips_tracker():
    tracker = FakeTracker()
    client = FakeCommandClient(result=0)
    pipeline = _make_pipeline(FakeDownloader(), client, tracker, FakeStrategy())

    result = await pipeline.request_forcesave(_context(userdata=None), "order-1-x")

    assert result == {"message": "save_requested", "save_id": None, "command_error": None}
    assert client.calls == [("order-1-x", None)]
    assert tracker.calls == []


async def test_request_forcesave_draft_kind_registers_draft_doc_type():
    tracker = FakeTracker()
    client = FakeCommandClient(result=0)
    pipeline = _make_pipeline(FakeDownloader(), client, tracker, FakeStrategy())

    await pipeline.request_forcesave(_context(kind=CallbackKind.ORDER_DRAFT, entity_id="d1", userdata="sid"), "draft-d1-1")

    assert tracker.calls == [("register", "sid", "order-draft", "d1")]


# ── синглтон ────────────────────────────────────────────────────────────────


def test_singleton_uses_production_deps():
    from app.services.onlyoffice_save_tracker import onlyoffice_save_tracker as prod_tracker
    from app.services.onlyoffice_service import onlyoffice_service as prod_service

    assert onlyoffice_callback_pipeline._downloader is prod_service
    assert onlyoffice_callback_pipeline._command_client is prod_service
    assert onlyoffice_callback_pipeline._tracker is prod_tracker
    assert onlyoffice_callback_pipeline._strategies is BUILTIN_STRATEGIES
    assert set(onlyoffice_callback_pipeline._strategies.keys()) == set(CallbackKind)
