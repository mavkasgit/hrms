from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from docx import Document
from jose import jwt

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.schemas.order import OrderCreate
from app.services.onlyoffice_service import OnlyOfficeService
from app.services.order_draft_service import OrderDraftService


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

    monkeypatch.setattr("app.services.order_draft_service.order_service._build_document", fake_build_document)
    monkeypatch.setattr("app.services.order_draft_service.order_service._build_filename", lambda *_args: "order.docx")

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
    from app.services.order_service import order_service

    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))

    draft_service = OrderDraftService()
    draft_service._drafts_dir = tmp_path / ".drafts"
    draft_service.ensure_drafts_dir()
    draft_path = draft_service._drafts_dir / "12345678-1234-1234-1234-123456789abc_order.docx"
    draft_path.write_bytes(b"draft")

    monkeypatch.setattr("app.services.order_draft_service.order_draft_service", draft_service)
    monkeypatch.setattr(order_service, "_build_document", AsyncMock(return_value=(Document(), {"{order_number}": "1"})))
    monkeypatch.setattr(order_service, "_build_filename", lambda *_args: "final.docx")

    result = await order_service._generate_document(
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

    assert (tmp_path / result).read_bytes() == b"draft"
    assert not draft_path.exists()
