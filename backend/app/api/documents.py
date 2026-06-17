import os
from datetime import datetime
from pathlib import Path
from typing import Any
import ipaddress
import json
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query, Request, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import HRMSException
from app.core.paths import storage_path, to_relative
from app.models.document import Document
from app.services.onlyoffice_service import onlyoffice_service

router = APIRouter(prefix="/documents/{doc_code}", tags=["documents"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PDF_MEDIA_TYPE = "application/pdf"


from app.api.deps import get_current_user as _get_current_user_stub


def _public_api_url(path: str) -> str:
    # BACKEND_INTERNAL_CALLBACK_URL is backend base URL reachable by ONLYOFFICE.
    # APP_PUBLIC_URL remains as backward-compatible fallback.
    # Add /api prefix for backend routes.
    base_url = (settings.BACKEND_INTERNAL_CALLBACK_URL or settings.APP_PUBLIC_URL).rstrip("/")
    return f"{base_url}/api{path}"


def _is_private_or_loopback_host(hostname: str | None) -> bool:
    if not hostname:
        return False
    if hostname in {"localhost", "127.0.0.1", "::1"}:
        return True
    try:
        addr = ipaddress.ip_address(hostname.strip("[]"))
    except ValueError:
        return False
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_unspecified
    )


def _request_origin(request: Request) -> str:
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    cf_visitor_raw = request.headers.get("cf-visitor")
    if cf_visitor_raw:
        try:
            cf_scheme = json.loads(cf_visitor_raw).get("scheme")
            if cf_scheme in {"http", "https"}:
                proto = cf_scheme
        except Exception:
            pass
    if not proto:
        proto = request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    host_only = (host or "").split(":")[0]
    if _is_private_or_loopback_host(host_only):
        external_origin = _external_origin_from_headers(request)
        if external_origin:
            return external_origin
    return f"{proto}://{host}".rstrip("/")


def _external_origin_from_headers(request: Request) -> str | None:
    for raw in (request.headers.get("origin"), request.headers.get("referer")):
        if not raw:
            continue
        try:
            parsed = urlparse(raw)
        except Exception:
            continue
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue
        if parsed.hostname and not _is_private_or_loopback_host(parsed.hostname):
            return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    return None


def _document_server_url(request: Request) -> str:
    # ========================================================================
    # ARCHITECTURE REFERENCE: How OnlyOffice URLs work
    # ========================================================================
    #
    # DEV MODE (docker compose up for postgres + onlyoffice, local backend/frontend):
    #   - Frontend: Vite dev server on localhost:5173
    #   - Backend:  uvicorn on localhost:8000
    #   - OnlyOffice: Docker container on localhost:8085
    #   - No nginx proxy in dev
    #   - Browser needs direct access to OnlyOffice at http://localhost:8085
    #   - Solution: use ONLYOFFICE_PUBLIC_URL from .env.dev (http://localhost:8085)
    #
    # DOCKER / PROD MODE (full docker compose with all services):
    #   - All containers share the same Docker network (hrms_default)
    #   - nginx listens on :80 and proxies:
    #       /api/        -> backend:8000
    #       /web-apps/   -> onlyoffice:80  (internal Docker DNS)
    #   - Frontend container serves static files through nginx
    #   - Browser makes ALL requests to one origin (e.g. http://server:80)
    #   - /web-apps/... reaches OnlyOffice via nginx proxy to onlyoffice:80
    #   - Request origin (http://server:80) IS the correct documentServerUrl
    #   - .env.prod sets ONLYOFFICE_PUBLIC_URL=${PUBLIC_URL}/onlyoffice
    #     but since this is the same as request origin, the fallback works
    #
    # KEY INSIGHT:
    #   In dev the backend returns http://localhost:8085 (OnlyOffice container direct)
    #   In prod the backend returns http://server:80 (nginx origin, which proxies to OnlyOffice)
    #   The ONLYOFFICE_PUBLIC_URL check handles dev; the fallback handles prod.
    # ========================================================================
    if settings.ONLYOFFICE_PUBLIC_URL:
        return settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
    return _request_origin(request)


def _documents_dir(doc_code: str) -> Path:
    base = Path(settings.STAFFING_PATH)
    path = base / doc_code
    path.mkdir(parents=True, exist_ok=True)
    return path


def _resolve_file_path(relative_path: str, doc_code: str | None = None) -> Path:
    """Convert path stored in DB to absolute path on disk."""
    if doc_code == "vacation_calendar":
        key = str(relative_path).strip().replace("\\", "/")
        if not key.startswith("vacation_calendar/"):
            key = f"vacation_calendar/{key.lstrip('/')}"
        return storage_path(key, "STAFFING_PATH")
    return storage_path(relative_path, "STAFFING_PATH")


def _make_relative_path(absolute_path: Path) -> str:
    """Convert absolute path to relative path for DB storage (relative to STAFFING_PATH)."""
    return to_relative(absolute_path, "STAFFING_PATH")


def _media_type_for_ext(ext: str) -> str:
    if ext == "docx":
        return DOCX_MEDIA_TYPE
    if ext == "xlsx":
        return XLSX_MEDIA_TYPE
    if ext == "pdf":
        return PDF_MEDIA_TYPE
    return "application/octet-stream"


def _extract_callback_token(request: Request, body: dict[str, Any]) -> str | None:
    token = body.get("token")
    if token:
        return str(token)
    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip()


def _assert_valid_callback_token(request: Request, body: dict[str, Any]) -> None:
    token = _extract_callback_token(request, body)
    if not token or not onlyoffice_service.validate_callback_token(token):
        raise HRMSException("Невалидный JWT OnlyOffice", "invalid_onlyoffice_jwt", status_code=403)


class DocumentResponse(BaseModel):
    id: int
    doc_code: str
    original_filename: str
    file_type: str
    uploaded_at: datetime
    uploaded_by: str | None
    edited_at: datetime | None
    is_current: bool

    class Config:
        from_attributes = True


class DocumentCurrentResponse(BaseModel):
    document: DocumentResponse | None


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    doc_code: str,
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await db.execute(
        select(Document)
        .where(Document.doc_code == doc_code)
        .order_by(Document.uploaded_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/current", response_model=DocumentCurrentResponse)
async def get_current_document(
    doc_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await db.execute(
        select(Document)
        .where(Document.doc_code == doc_code, Document.is_current == True)
        .order_by(Document.uploaded_at.desc())
        .limit(1)
    )
    doc = result.scalar_one_or_none()
    return {"document": doc}


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    doc_code: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not file.filename:
        raise HRMSException("Имя файла не указано", "invalid_filename", status_code=400)

    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in ("docx", "xlsx", "pdf"):
        raise HRMSException(
            "Допустимые форматы: .docx, .xlsx, .pdf",
            "invalid_file_type",
            status_code=400,
        )

    content = await file.read()
    if len(content) > settings.MAX_DOCUMENT_SIZE:
        raise HRMSException(
            f"Файл слишком большой (макс {settings.MAX_DOCUMENT_SIZE // 1024 // 1024} МБ)",
            "file_too_large",
            status_code=413,
        )

    documents_dir = _documents_dir(doc_code)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = Path(file.filename).stem.replace(" ", "_")
    storage_filename = f"{timestamp}_{safe_name}.{ext}"
    file_path = documents_dir / storage_filename

    file_path.write_bytes(content)

    # Mark previous current as non-current
    await db.execute(
        update(Document)
        .where(Document.doc_code == doc_code, Document.is_current == True)
        .values(is_current=False)
    )

    doc = Document(
        doc_code=doc_code,
        file_path=_make_relative_path(file_path),
        original_filename=file.filename,
        file_type=ext,
        uploaded_by=current_user,
        is_current=True,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/{doc_id}/onlyoffice/config")
async def document_onlyoffice_config(
    doc_code: str,
    doc_id: int,
    request: Request,
    mode: str = Query("view", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        raise HRMSException("OnlyOffice отключен", "onlyoffice_disabled", status_code=503)

    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.doc_code == doc_code)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HRMSException("Документ не найден", "doc_not_found", status_code=404)

    file_path = _resolve_file_path(doc.file_path, doc_code)
    if not file_path.exists():
        raise HRMSException("Файл отсутствует на диске", "doc_file_missing", status_code=404)

    config = onlyoffice_service.build_config(
        doc_type=doc_code,
        doc_id=doc_id,
        file_path=file_path,
        title=doc.original_filename,
        callback_url=_public_api_url(f"/documents/{doc_code}/{doc_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/documents/{doc_code}/{doc_id}/file"),
        mode=mode,
    )
    config["documentServerUrl"] = _document_server_url(request)
    return config


@router.get("/{doc_id}/file")
async def document_file(
    doc_code: str,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.doc_code == doc_code)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HRMSException("Документ не найден", "doc_not_found", status_code=404)

    file_path = _resolve_file_path(doc.file_path, doc_code)
    if not file_path.exists():
        raise HRMSException("Файл отсутствует на диске", "doc_file_missing", status_code=404)

    return FileResponse(
        str(file_path),
        filename=doc.original_filename,
        media_type=_media_type_for_ext(doc.file_type),
    )


@router.post("/{doc_id}/onlyoffice/callback")
async def document_onlyoffice_callback(
    doc_code: str,
    doc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()
    _assert_valid_callback_token(request, body)

    if body.get("status") in (2, 6) and body.get("url"):
        result = await db.execute(
            select(Document).where(Document.id == doc_id, Document.doc_code == doc_code)
        )
        doc = result.scalar_one_or_none()
        if doc:
            file_path = _resolve_file_path(doc.file_path, doc_code)
            await onlyoffice_service.download_and_replace(str(body["url"]), file_path)
            doc.edited_at = datetime.now()
            await db.commit()
    return {"error": 0}


class OnlyOfficeForceSaveRequest(BaseModel):
    document_key: str


@router.post("/{doc_id}/onlyoffice/forcesave")
async def document_onlyoffice_forcesave(
    doc_code: str,
    doc_id: int,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        raise HRMSException("OnlyOffice отключен", "onlyoffice_disabled", status_code=503)
    if not data.document_key.startswith(f"{doc_code}-{doc_id}-"):
        raise HRMSException("Неверный ключ документа OnlyOffice", "invalid_onlyoffice_key", status_code=422)
    await onlyoffice_service.force_save(data.document_key)
    return {"message": "save_requested"}


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    doc_code: str,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.doc_code == doc_code)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HRMSException("Документ не найден", "doc_not_found", status_code=404)

    # Delete file from disk
    file_path = _resolve_file_path(doc.file_path, doc_code)
    if file_path.exists():
        file_path.unlink()

    await db.delete(doc)
    await db.commit()
