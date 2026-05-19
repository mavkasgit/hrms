from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.notification_type_service import notification_type_service, get_template_path
from app.services.template_variables_service import get_template_variables as get_all_template_variables

router = APIRouter(prefix="/notification-types", tags=["notification-types"])


def _get_current_user_stub() -> str:
    return "admin"


@router.get("", response_model=list[dict[str, Any]])
async def list_notification_types(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await notification_type_service.get_notification_types(db, active_only=False)


@router.get("/variables")
async def get_template_variables(
    current_user: str = Depends(_get_current_user_stub),
):
    return {"variables": get_all_template_variables("notification")}


@router.post("", response_model=dict[str, Any], status_code=201)
async def create_notification_type(
    data: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await notification_type_service.create_notification_type(db, data)


@router.put("/{notification_type_id}", response_model=dict[str, Any])
async def update_notification_type(
    notification_type_id: int,
    data: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await notification_type_service.update_notification_type(db, notification_type_id, data)


@router.delete("/{notification_type_id}")
async def delete_notification_type(
    notification_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await notification_type_service.delete_notification_type(db, notification_type_id)
    return {"message": "Тип уведомления удален"}


@router.post("/{notification_type_id}/template", response_model=dict[str, Any])
async def upload_template(
    notification_type_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not file.filename or not file.filename.endswith(".docx"):
        raise HTTPException(400, "Только файлы .docx")
    content = await file.read()
    return await notification_type_service.upload_template(db, notification_type_id, file.filename, content)


@router.delete("/{notification_type_id}/template")
async def delete_template(
    notification_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await notification_type_service.delete_template(db, notification_type_id)
    return {"message": "Шаблон удален"}


@router.get("/{notification_type_id}/template")
async def download_template(
    notification_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    from app.core.exceptions import HRMSException
    try:
        n_type = await notification_type_service.get_notification_type(db, notification_type_id)
    except HRMSException:
        raise HTTPException(404, "Тип уведомления не найден")
    if not n_type.template_filename:
        raise HTTPException(404, "Шаблон не найден")
    file_path = get_template_path(n_type)
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не найден")
    return FileResponse(
        str(file_path),
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


# ─── OnlyOffice for notification type templates ──────────────────────────────

from fastapi import Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from app.core.config import settings
from app.core.exceptions import HRMSException
from app.services.onlyoffice_service import onlyoffice_service


class OnlyOfficeForceSaveRequest(BaseModel):
    document_key: str


def _ensure_onlyoffice_enabled() -> None:
    if not settings.ONLYOFFICE_ENABLED:
        raise HRMSException("OnlyOffice отключен", "onlyoffice_disabled", status_code=503)


def _public_api_url(path: str) -> str:
    base_url = (settings.BACKEND_INTERNAL_CALLBACK_URL or settings.APP_PUBLIC_URL).rstrip("/")
    return f"{base_url}/api{path}"


def _document_server_url(request: Request) -> str:
    if settings.ONLYOFFICE_PUBLIC_URL:
        return settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    cf_visitor_raw = request.headers.get("cf-visitor")
    if cf_visitor_raw:
        try:
            import json
            cf_scheme = json.loads(cf_visitor_raw).get("scheme")
            if cf_scheme in {"http", "https"}:
                proto = cf_scheme
        except Exception:
            pass
    if not proto:
        proto = request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}".rstrip("/")


def _assert_valid_callback_token(request: Request, body: dict) -> None:
    token = body.get("token")
    if token:
        token = str(token)
    if not token:
        authorization = request.headers.get("authorization") or request.headers.get("Authorization")
        if authorization and authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
    if not token or not onlyoffice_service.validate_callback_token(token):
        raise HRMSException("Невалидный JWT OnlyOffice", "invalid_onlyoffice_jwt", status_code=403)


@router.get("/{notification_type_id}/onlyoffice/config")
async def notification_type_onlyoffice_config(
    notification_type_id: int,
    request: Request,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    n_type = await notification_type_service.get_notification_type(db, notification_type_id)
    if not n_type:
        raise HTTPException(404, "Тип уведомления не найден")
    file_path = get_template_path(n_type)
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не найден")

    config = onlyoffice_service.build_config(
        doc_type="notification_template",
        doc_id=notification_type_id,
        file_path=file_path,
        title=file_path.name,
        callback_url=_public_api_url(f"/notification-types/{notification_type_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/notification-types/{notification_type_id}/onlyoffice/file"),
        mode=mode,
    )
    config["documentServerUrl"] = _document_server_url(request)
    return config


@router.get("/{notification_type_id}/onlyoffice/file")
async def notification_type_onlyoffice_file(
    notification_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    n_type = await notification_type_service.get_notification_type(db, notification_type_id)
    if not n_type:
        raise HTTPException(404, "Тип уведомления не найден")
    file_path = get_template_path(n_type)
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не найден")
    return FileResponse(
        str(file_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.post("/{notification_type_id}/onlyoffice/callback")
async def notification_type_onlyoffice_callback(
    notification_type_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()
    try:
        _assert_valid_callback_token(request, body)
    except HRMSException as exc:
        return JSONResponse(content={"error": 1, "message": str(exc.detail)}, status_code=exc.status_code)

    if body.get("status") in (2, 6) and body.get("url"):
        n_type = await notification_type_service.get_notification_type(db, notification_type_id)
        if n_type:
            file_path = get_template_path(n_type)
            await onlyoffice_service.download_and_replace(str(body["url"]), file_path)
    return {"error": 0}


@router.post("/{notification_type_id}/onlyoffice/forcesave")
async def notification_type_onlyoffice_forcesave(
    notification_type_id: int,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    if not data.document_key.startswith(f"notification_template-{notification_type_id}-"):
        raise HTTPException(422, "Неверный ключ документа OnlyOffice")
    await onlyoffice_service.force_save(data.document_key)
    return {"message": "save_requested"}
