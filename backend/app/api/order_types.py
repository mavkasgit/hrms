import shutil
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from app.core.database import get_db
from app.schemas.order_type import (
    OrderTypeCreate,
    OrderTypeListResponse,
    OrderTypeResponse,
    OrderTypeUpdate,
    TemplateVariablesResponse,
)
from app.services.order_service import order_service

router = APIRouter(prefix="/order-types", tags=["order-types"])


def _get_current_user_stub() -> str:
    return "admin"


@router.get("", response_model=OrderTypeListResponse)
async def list_order_types(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return {"items": await order_service.get_order_types(db, active_only=False)}


@router.get("/variables", response_model=TemplateVariablesResponse)
async def get_template_variables(
    current_user: str = Depends(_get_current_user_stub),
):
    return {"variables": order_service.get_template_variables()}


@router.post("", response_model=OrderTypeResponse, status_code=201)
async def create_order_type(
    data: OrderTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await order_service.create_order_type(db, data)


@router.put("/{order_type_id}", response_model=OrderTypeResponse)
async def update_order_type(
    order_type_id: int,
    data: OrderTypeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await order_service.update_order_type(db, order_type_id, data)


@router.delete("/{order_type_id}")
async def delete_order_type(
    order_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await order_service.delete_order_type(db, order_type_id)
    return {"message": "Тип приказа удален"}


@router.post("/{order_type_id}/template", response_model=OrderTypeResponse)
async def upload_template(
    order_type_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not file.filename or not file.filename.endswith(".docx"):
        raise HTTPException(400, "Только файлы .docx")
    content = await file.read()
    return await order_service.upload_template(db, order_type_id, file.filename, content)


@router.post("/templates/bulk-upload")
async def bulk_upload_templates(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
) -> dict[str, Any]:
    results = await order_service.bulk_upload_templates(db, files)
    return results


@router.delete("/{order_type_id}/template")
async def delete_template(
    order_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await order_service.delete_template(db, order_type_id)
    return {"message": "Шаблон удален"}


@router.get("/{order_type_id}/template")
async def download_template(
    order_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order_type = await order_service.get_order_type(db, order_type_id)
    if not order_type.template_filename:
        raise HTTPException(404, "Шаблон не найден")
    file_path = Path(order_service._get_template_path(order_type))
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не найден")
    return FileResponse(
        str(file_path),
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/{order_type_id}/template/preview")
async def preview_template(
    order_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order_type = await order_service.get_order_type(db, order_type_id)
    if not order_type.template_filename:
        raise HTTPException(404, "Шаблон не найден")
    template_path = Path(order_service._get_template_path(order_type))
    if not template_path.exists():
        raise HTTPException(404, "Шаблон не найден")

    temp_dir = Path(tempfile.mkdtemp(prefix="hrms-template-preview-"))
    try:
        pdf_path = await order_service.generate_template_preview(db, order_type_id, temp_dir)
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise

    filename = f"{order_type.code}_preview.pdf"
    fallback_filename = f"template-preview-{order_type_id}.pdf"
    content_disposition = f"inline; filename=\"{fallback_filename}\"; filename*=UTF-8''{quote(filename)}"
    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        headers={"Content-Disposition": content_disposition},
        background=BackgroundTask(shutil.rmtree, temp_dir, ignore_errors=True),
    )
