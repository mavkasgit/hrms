from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
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
async def test_order_service_uses_draft_docx(monkeypatch, tmp_path):
    from app.services.order_document_service import generate_document

    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))

    draft_service = OrderDraftService()
    draft_service._drafts_dir = tmp_path / ".drafts"
    draft_service.ensure_drafts_dir()
    draft_path = draft_service._drafts_dir / "12345678-1234-1234-1234-123456789abc_order.docx"
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
            draft_id="12345678-1234-1234-1234-123456789abc",
        ),
        SimpleNamespace(name="Иванов Иван Иванович"),
        SimpleNamespace(code="test", name="Тест", filename_pattern="final.docx"),
        tmp_path,
    )

    assert (tmp_path / result[0]).read_bytes() == b"draft"
    assert not draft_path.exists()


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
