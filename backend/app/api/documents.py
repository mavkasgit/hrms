import os
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import HRMSException
from app.models.document import Document
from app.services.onlyoffice_service import onlyoffice_service

router = APIRouter(prefix="/documents/{doc_code}", tags=["documents"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PDF_MEDIA_TYPE = "application/pdf"


def _get_current_user_stub() -> str:
    return "admin"


def _public_api_url(path: str) -> str:
    return f"{settings.APP_PUBLIC_URL.rstrip('/')}/api{path}"


def _documents_dir(doc_code: str) -> Path:
    base = Path(settings.STAFFING_PATH)
    path = base / doc_code
    path.mkdir(parents=True, exist_ok=True)
    return path


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
        file_path=str(file_path),
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

    file_path = Path(doc.file_path)
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
    config["documentServerUrl"] = settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
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

    file_path = Path(doc.file_path)
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
            await onlyoffice_service.download_and_replace(str(body["url"]), Path(doc.file_path))
    return {"error": 0}


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
    file_path = Path(doc.file_path)
    if file_path.exists():
        file_path.unlink()

    await db.delete(doc)
    await db.commit()
