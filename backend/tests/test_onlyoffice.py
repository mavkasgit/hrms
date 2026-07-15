from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
import os
import time

import pytest
from docx import Document
from jose import jwt

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.api.orders import print_order_pdf
from app.schemas.order import OrderCreate
from app.services.onlyoffice_service import OnlyOfficeService
from app.services.order_draft_service import OrderDraftService
from app.services.order_print_service import OrderPrintService, order_print_service
from app.services.order_service import order_service


def test_onlyoffice_config_print_allowed(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    docx_path = tmp_path / "order.docx"
    docx_path.write_bytes(b"PK")

    config = OnlyOfficeService().build_config(
        doc_type="order",
        doc_id=1,
        file_path=docx_path,
        title="order.docx",
        callback_url="http://app/api/orders/1/onlyoffice/callback",
        file_url="http://app/api/orders/1/onlyoffice/file",
        allow_print=True,
    )

    assert config["document"]["permissions"]["print"] is True


def test_onlyoffice_config_print_disabled(monkeypatch, tmp_path):
    """Draft config should have print: False, and the JWT token should reflect it."""
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    docx_path = tmp_path / "draft.docx"
    docx_path.write_bytes(b"PK")

    config = OnlyOfficeService().build_config(
        doc_type="draft",
        doc_id="test-draft-id",
        file_path=docx_path,
        title="draft.docx",
        callback_url="http://app/api/orders/drafts/test-draft-id/onlyoffice/callback",
        file_url="http://app/api/orders/drafts/test-draft-id/onlyoffice/file",
        allow_print=False,
    )

    assert config["document"]["permissions"]["print"] is False
    decoded = jwt.decode(config["token"], "test-secret", algorithms=["HS256"])
    assert decoded["document"]["permissions"]["print"] is False


def test_onlyoffice_config_contains_signed_token(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    docx_path = tmp_path / "order.docx"
    docx_path.write_bytes(b"PK")

    config = OnlyOfficeService().build_config(
        doc_type="order",
        doc_id=1,
        file_path=docx_path,
        title="order.docx",
        callback_url="http://app/api/orders/1/onlyoffice/callback",
        file_url="http://app/api/orders/1/onlyoffice/file",
    )

    assert config["document"]["fileType"] == "docx"
    assert config["document"]["key"].startswith("order-1-")
    decoded = jwt.decode(config["token"], "test-secret", algorithms=["HS256"])
    assert decoded["document"]["url"] == "http://app/api/orders/1/onlyoffice/file"


def test_onlyoffice_callback_token_validation(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    service = OnlyOfficeService()
    token = jwt.encode({"status": 2}, "test-secret", algorithm="HS256")

    assert service.validate_callback_token(token) is True
    assert service.validate_callback_token("bad-token") is False


def test_onlyoffice_download_url_uses_internal_url(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_PUBLIC_URL", "http://localhost:8085")
    monkeypatch.setattr(settings, "ONLYOFFICE_INTERNAL_URL", "http://onlyoffice:80")

    normalized = OnlyOfficeService()._normalize_download_url("http://localhost:8085/cache/doc.docx")

    assert normalized == "http://onlyoffice:80/cache/doc.docx"


@pytest.mark.asyncio
async def test_replace_docx_atomically(tmp_path):
    target = tmp_path / "target.docx"
    temp = tmp_path / "temp.docx"
    target.write_bytes(b"old")
    temp.write_bytes(b"new")

    await OnlyOfficeService()._replace_docx_atomically(target, temp)

    assert target.read_bytes() == b"new"
    assert not temp.exists()


@pytest.mark.asyncio
async def test_order_draft_service_creates_docx(monkeypatch, tmp_path):
    service = OrderDraftService()
    service._drafts_dir = tmp_path / ".drafts"

    document = Document()
    document.add_paragraph("Черновик")

    async def fake_build_document(*_args, **_kwargs):
        return document, {"{order_number}": "1"}

    monkeypatch.setattr("app.services.order_draft_service._build_document", fake_build_document)
    monkeypatch.setattr("app.services.order_draft_service._build_filename", lambda *_args: "order.docx")

    draft = await service.create_draft(
        OrderCreate(employee_id=1, order_type_id=2, order_date=date.today(), order_number="1"),
        SimpleNamespace(name="Иванов Иван Иванович"),
        SimpleNamespace(code="test", name="Тест"),
    )

    assert draft["draft_id"]
    assert Path(draft["file_path"]).exists()


def test_order_draft_service_rejects_unknown_draft(tmp_path):
    service = OrderDraftService()
    service._drafts_dir = tmp_path / ".drafts"

    with pytest.raises(HRMSException) as exc_info:
        service.get_draft_path("not-a-draft")

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_generate_document_from_draft_keeps_draft(monkeypatch, tmp_path):
    """generate_document copies draft to permanent storage but does NOT delete the draft."""
    from app.services.order_document_service import generate_document

    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))

    draft_service = OrderDraftService()
    draft_service._drafts_dir = tmp_path / ".drafts"
    draft_service.ensure_drafts_dir()
    draft_id = "12345678-1234-1234-1234-123456789abc"
    draft_path = draft_service._drafts_dir / f"{draft_id}_order.docx"
    draft_path.write_bytes(b"draft")

    monkeypatch.setattr("app.services.order_draft_service.order_draft_service", draft_service)
    monkeypatch.setattr("app.services.order_document_service._build_document", AsyncMock(return_value=(Document(), {"{order_number}": "1"})))
    monkeypatch.setattr("app.services.order_document_service._build_filename", lambda *_args: "final.docx")

    result = await generate_document(
        "1",
        OrderCreate(
            employee_id=1,
            order_type_id=2,
            order_date=date.today(),
            order_number="1",
            draft_id=draft_id,
        ),
        SimpleNamespace(name="Иванов Иван Иванович"),
        SimpleNamespace(code="test", name="Тест", filename_pattern="final.docx"),
        tmp_path,
    )

    assert (tmp_path / result[0]).read_bytes() == b"draft"
    # Draft must remain until create_order succeeds (retry-safe).
    assert draft_path.exists()


@pytest.mark.asyncio
async def test_create_order_deletes_draft_after_success(monkeypatch, tmp_path):
    """Draft is deleted only after _do_create_order succeeds (group-commit pattern)."""
    from app.services.order_draft_service import order_draft_service
    from app.services.order_service import OrderService

    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))
    order_draft_service._drafts_dir = tmp_path / ".drafts"
    order_draft_service.ensure_drafts_dir()

    draft_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    draft_path = order_draft_service._drafts_dir / f"{draft_id}_order.docx"
    draft_path.write_bytes(b"draft-content")

    svc = OrderService()
    fake_order = SimpleNamespace(id=42)

    async def fake_ensure(db):
        return []

    async def fake_do_create(db, data):
        assert data.draft_id == draft_id
        assert draft_path.exists(), "draft must still exist during create"
        return fake_order

    monkeypatch.setattr(svc, "ensure_default_order_types", fake_ensure)
    monkeypatch.setattr(svc, "_do_create_order", fake_do_create)

    db = MagicMock()
    db.in_transaction.return_value = True

    order = await svc.create_order(
        db,
        OrderCreate(
            employee_id=None,
            order_type_id=1,
            order_date=date.today(),
            order_number="DRAFT-OK-1",
            draft_id=draft_id,
        ),
    )

    assert order.id == 42
    assert not draft_path.exists()


@pytest.mark.asyncio
async def test_create_order_keeps_draft_when_create_fails(monkeypatch, tmp_path):
    """If create fails after draft copy, draft remains and permanent file is cleaned up."""
    from app.services import order_service as order_service_module
    from app.services.order_draft_service import order_draft_service
    from app.services.order_service import OrderService

    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))
    order_draft_service._drafts_dir = tmp_path / ".drafts"
    order_draft_service.ensure_drafts_dir()

    draft_id = "11111111-2222-3333-4444-555555555555"
    draft_path = order_draft_service._drafts_dir / f"{draft_id}_order.docx"
    draft_path.write_bytes(b"draft-retry")

    permanent_written: list[Path] = []

    async def fake_generate(order_number, data, employee, order_type, year_dir_arg):
        year_dir_arg.mkdir(parents=True, exist_ok=True)
        dest = year_dir_arg / f"{order_type.code}_{order_number}.docx"
        dest.write_bytes(b"copied-from-draft")
        permanent_written.append(dest)
        return f"{data.order_date.year}/{dest.name}", dest.name

    async def failing_finish(*_args, **_kwargs):
        raise RuntimeError("simulated DB failure")

    svc = OrderService()
    order_type = SimpleNamespace(id=1, code="general_order", name="Общий", is_active=True)

    async def fake_ensure(db):
        return [order_type]

    async def fake_get_type(db, type_id):
        return order_type

    monkeypatch.setattr(order_service_module, "generate_document", fake_generate)
    monkeypatch.setattr(svc, "ensure_default_order_types", fake_ensure)
    monkeypatch.setattr(svc.order_type_repo, "get_by_id", fake_get_type)
    monkeypatch.setattr(svc, "_finish_create_order", failing_finish)

    db = MagicMock()
    db.in_transaction.return_value = True

    with pytest.raises(RuntimeError, match="simulated DB failure"):
        await svc.create_order(
            db,
            OrderCreate(
                employee_id=None,
                order_type_id=1,
                order_date=date.today(),
                order_number="DRAFT-FAIL-1",
                draft_id=draft_id,
            ),
        )

    assert draft_path.exists(), "draft must remain for retry after failed create"
    for p in permanent_written:
        assert not p.exists(), f"orphan permanent file should be cleaned up: {p}"


@pytest.mark.asyncio
async def test_order_print_service_uses_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "BACKEND_INTERNAL_CALLBACK_URL", "http://app")
    monkeypatch.setattr(settings, "APP_PUBLIC_URL", "http://app")
    monkeypatch.setattr(settings, "ONLYOFFICE_PUBLIC_URL", "http://localhost:8085")
    monkeypatch.setattr(settings, "ONLYOFFICE_INTERNAL_URL", "http://onlyoffice:80")

    source_docx = tmp_path / "2026" / "order.docx"
    source_docx.parent.mkdir(parents=True, exist_ok=True)
    source_docx.write_bytes(b"PK")

    service = OrderPrintService()
    convert_calls: list[str] = []
    download_calls: list[str] = []

    async def fake_convert(entity_kind: str, entity_id: int, docx_path: Path, cache_key: str) -> str:
        assert entity_kind == "order"
        assert entity_id == 7
        convert_calls.append(cache_key)
        return "http://onlyoffice/cache/converted.pdf"

    async def fake_download(file_url: str) -> bytes:
        download_calls.append(file_url)
        return b"%PDF-1.7 test"

    monkeypatch.setattr(service, "_convert_docx_to_pdf", fake_convert)
    monkeypatch.setattr(service, "_download_pdf", fake_download)

    first = await service.get_or_create_pdf("order", 7, source_docx)
    second = await service.get_or_create_pdf("order", 7, source_docx)
    new_mtime = time.time() + 5
    os.utime(source_docx, (new_mtime, new_mtime))
    third = await service.get_or_create_pdf("order", 7, source_docx)

    assert first == second
    assert third != first
    assert not first.exists()
    assert third.exists()
    assert third.read_bytes() == b"%PDF-1.7 test"
    assert len(convert_calls) == 2
    assert len(download_calls) == 2


@pytest.mark.asyncio
async def test_order_print_service_uses_distinct_cache_namespace(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "BACKEND_INTERNAL_CALLBACK_URL", "http://app")
    monkeypatch.setattr(settings, "APP_PUBLIC_URL", "http://app")
    monkeypatch.setattr(settings, "ONLYOFFICE_PUBLIC_URL", "http://localhost:8085")
    monkeypatch.setattr(settings, "ONLYOFFICE_INTERNAL_URL", "http://onlyoffice:80")

    source_docx = tmp_path / "2026" / "doc.docx"
    source_docx.parent.mkdir(parents=True, exist_ok=True)
    source_docx.write_bytes(b"PK")

    service = OrderPrintService()
    convert_calls: list[str] = []

    async def fake_convert(_entity_kind: str, _entity_id: int, _docx_path: Path, cache_key: str) -> str:
        convert_calls.append(cache_key)
        return f"http://onlyoffice/cache/{cache_key}.pdf"

    async def fake_download(file_url: str) -> bytes:
        return f"%PDF-{file_url}".encode("utf-8")

    monkeypatch.setattr(service, "_convert_docx_to_pdf", fake_convert)
    monkeypatch.setattr(service, "_download_pdf", fake_download)

    order_pdf = await service.get_or_create_pdf("order", 42, source_docx)
    notification_pdf = await service.get_or_create_pdf("notification", 42, source_docx)

    assert order_pdf != notification_pdf
    assert order_pdf.exists()
    assert notification_pdf.exists()
    assert order_pdf.name.startswith("order-42-")
    assert notification_pdf.name.startswith("notification-42-")
    assert len(convert_calls) == 2


@pytest.mark.asyncio
async def test_order_print_pdf_endpoint_returns_inline_file(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))

    docx_path = tmp_path / "2026" / "order.docx"
    docx_path.parent.mkdir(parents=True, exist_ok=True)
    docx_path.write_bytes(b"PK")

    pdf_path = tmp_path / ".print_cache" / "order-1-123.pdf"
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(b"%PDF-1.7")

    async def fake_get_by_id(_db, _order_id):
        return SimpleNamespace(file_path="2026/order.docx")

    async def fake_get_or_create_pdf(_entity_kind, _order_id, _docx_path: Path):
        return pdf_path

    monkeypatch.setattr(order_service, "get_by_id", fake_get_by_id)
    monkeypatch.setattr(order_print_service, "get_or_create_pdf", fake_get_or_create_pdf)

    response = await print_order_pdf(order_id=1, db=object(), current_user="admin")

    assert response.media_type == "application/pdf"
    assert response.headers["content-disposition"].startswith("inline;")


@pytest.mark.asyncio
async def test_order_print_pdf_endpoint_404_when_file_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))

    async def fake_get_by_id(_db, _order_id):
        return SimpleNamespace(file_path="2026/missing.docx")

    monkeypatch.setattr(order_service, "get_by_id", fake_get_by_id)

    with pytest.raises(HRMSException) as exc_info:
        await print_order_pdf(order_id=1, db=object(), current_user="admin")

    assert exc_info.value.status_code == 404
    assert exc_info.value.error_code == "order_file_missing"


@pytest.mark.asyncio
async def test_order_print_pdf_endpoint_propagates_conversion_error(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))

    docx_path = tmp_path / "2026" / "order.docx"
    docx_path.parent.mkdir(parents=True, exist_ok=True)
    docx_path.write_bytes(b"PK")

    async def fake_get_by_id(_db, _order_id):
        return SimpleNamespace(file_path="2026/order.docx")

    async def fake_get_or_create_pdf(_entity_kind, _order_id, _docx_path: Path):
        raise HRMSException("OnlyOffice conversion failed", "order_pdf_convert_failed", status_code=502)

    monkeypatch.setattr(order_service, "get_by_id", fake_get_by_id)
    monkeypatch.setattr(order_print_service, "get_or_create_pdf", fake_get_or_create_pdf)

    with pytest.raises(HRMSException) as exc_info:
        await print_order_pdf(order_id=1, db=object(), current_user="admin")

    assert exc_info.value.status_code == 502
    assert exc_info.value.error_code == "order_pdf_convert_failed"


@pytest.mark.asyncio
async def test_get_current_user_or_onlyoffice_valid_onlyoffice_token(monkeypatch):
    from app.api.deps import get_current_user_or_onlyoffice

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    token = jwt.encode({"status": 2}, "test-secret", algorithm="HS256")
    
    headers = {"Authorization": f"Bearer {token}"}
    mock_request = SimpleNamespace(headers=headers, method="GET", query_params={})

    result = await get_current_user_or_onlyoffice(request=mock_request, db=object())
    assert result == "onlyoffice_server"


@pytest.mark.asyncio
async def test_get_current_user_or_onlyoffice_fallback_to_user(monkeypatch):
    from fastapi import HTTPException
    from app.api.deps import get_current_user_or_onlyoffice

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    headers = {"Authorization": "Bearer invalid-token"}
    mock_request = SimpleNamespace(headers=headers, method="GET", query_params={})

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_or_onlyoffice(request=mock_request, db=object())
    
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_or_onlyoffice_query_token(monkeypatch):
    from app.api.deps import get_current_user_or_onlyoffice
    from fastapi import HTTPException

    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    mock_request = SimpleNamespace(
        headers={},
        method="GET",
        query_params={"token": "invalid-token"}
    )

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_or_onlyoffice(request=mock_request, db=object())
    
    assert exc_info.value.status_code == 401


