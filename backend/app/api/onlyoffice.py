from pathlib import Path
from typing import Any
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import EmployeeNotFoundError, HRMSException
from app.schemas.order import OrderCreate
from app.services.onlyoffice_service import onlyoffice_service
from app.services.order_draft_service import order_draft_service
from app.services.order_service import order_service
from app.repositories.references_repository import references_repository
from app.utils.working_days import calculate_vacation_days, count_holidays_in_range

router = APIRouter(tags=["onlyoffice"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class OnlyOfficeForceSaveRequest(BaseModel):
    document_key: str


def _get_current_user_stub() -> str:
    return "admin"


def _ensure_onlyoffice_enabled() -> None:
    if not settings.ONLYOFFICE_ENABLED:
        raise HRMSException("OnlyOffice отключен", "onlyoffice_disabled", status_code=503)


def _public_api_url(path: str) -> str:
    return f"{settings.APP_PUBLIC_URL.rstrip('/')}/api{path}"


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


def _file_response(file_path: Path) -> FileResponse:
    return FileResponse(str(file_path), filename=file_path.name, media_type=DOCX_MEDIA_TYPE)


@router.get("/orders/{order_id}/onlyoffice/config")
async def order_onlyoffice_config(
    order_id: int,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    order = await order_service.get_by_id(db, order_id)
    if not order.file_path:
        raise HRMSException("Файл приказа не найден", "order_file_not_found", status_code=404)
    file_path = Path(order.file_path)
    if not file_path.exists():
        raise HRMSException("Файл приказа отсутствует на диске", "order_file_missing", status_code=404)

    config = onlyoffice_service.build_config(
        doc_type="order",
        doc_id=order_id,
        file_path=file_path,
        title=file_path.name,
        callback_url=_public_api_url(f"/orders/{order_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/orders/{order_id}/onlyoffice/file"),
        mode=mode,
    )
    config["documentServerUrl"] = settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
    return config


@router.get("/orders/{order_id}/onlyoffice/file")
async def order_onlyoffice_file(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order = await order_service.get_by_id(db, order_id)
    if not order.file_path:
        raise HRMSException("Файл приказа не найден", "order_file_not_found", status_code=404)
    file_path = Path(order.file_path)
    if not file_path.exists():
        raise HRMSException("Файл приказа отсутствует на диске", "order_file_missing", status_code=404)
    return _file_response(file_path)


@router.post("/orders/{order_id}/onlyoffice/callback")
async def order_onlyoffice_callback(
    order_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()
    _assert_valid_callback_token(request, body)

    if body.get("status") in (2, 6) and body.get("url"):
        order = await order_service.get_by_id(db, order_id)
        if order.file_path:
            await onlyoffice_service.download_and_replace(str(body["url"]), Path(order.file_path))
    return {"error": 0}


@router.post("/orders/{order_id}/onlyoffice/forcesave")
async def order_onlyoffice_forcesave(
    order_id: int,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    if not data.document_key.startswith(f"order-{order_id}-"):
        raise HRMSException("Неверный ключ документа OnlyOffice", "invalid_onlyoffice_key", status_code=422)
    await onlyoffice_service.force_save(data.document_key)
    return {"message": "save_requested"}


@router.post("/orders/drafts")
async def create_order_draft(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    await order_service.ensure_default_order_types(db)

    employee = await order_service.employee_repo.get_by_id(db, data.employee_id)
    if not employee:
        raise EmployeeNotFoundError(data.employee_id)

    order_type = await order_service.order_type_repo.get_by_id(db, data.order_type_id)
    if not order_type or not order_type.is_active:
        raise HRMSException("Активный тип приказа не найден", "order_type_not_found", status_code=404)

    if not data.order_number:
        order_number = await order_service.order_repo.get_next_order_number(db, data.order_type_id)
        data = data.model_copy(update={"order_number": order_number})

    data = await _normalize_vacation_draft_fields(db, data, order_type.code)

    return await order_draft_service.create_draft(data, employee, order_type)


async def _normalize_vacation_draft_fields(db: AsyncSession, data: OrderCreate, order_type_code: str) -> OrderCreate:
    if order_type_code not in {"vacation_paid", "vacation_unpaid"} or not data.extra_fields:
        return data
    start_raw = data.extra_fields.get("vacation_start")
    end_raw = data.extra_fields.get("vacation_end")
    if not isinstance(start_raw, str) or not isinstance(end_raw, str):
        return data
    try:
        start = date.fromisoformat(start_raw)
        end = date.fromisoformat(end_raw)
    except ValueError:
        return data

    holidays = await references_repository.get_holidays_for_year(db, start.year)
    if end.year != start.year:
        holidays += await references_repository.get_holidays_for_year(db, end.year)
    days_count = calculate_vacation_days(start, end, count_holidays_in_range(holidays, start, end))
    extra_fields = {**data.extra_fields, "vacation_days": days_count}
    return data.model_copy(update={"extra_fields": extra_fields})


@router.get("/orders/drafts/{draft_id}/onlyoffice/config")
async def draft_onlyoffice_config(
    draft_id: str,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    file_path = order_draft_service.get_draft_path(draft_id)
    config = onlyoffice_service.build_config(
        doc_type="draft",
        doc_id=draft_id,
        file_path=file_path,
        title=file_path.name,
        callback_url=_public_api_url(f"/orders/drafts/{draft_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/orders/drafts/{draft_id}/file"),
    )
    config["documentServerUrl"] = settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
    return config


@router.get("/orders/drafts/{draft_id}/file")
async def draft_onlyoffice_file(
    draft_id: str,
    current_user: str = Depends(_get_current_user_stub),
):
    return _file_response(order_draft_service.get_draft_path(draft_id))


@router.post("/orders/drafts/{draft_id}/onlyoffice/callback")
async def draft_onlyoffice_callback(
    draft_id: str,
    request: Request,
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()
    _assert_valid_callback_token(request, body)

    if body.get("status") in (2, 6) and body.get("url"):
        await onlyoffice_service.download_and_replace(str(body["url"]), order_draft_service.get_draft_path(draft_id))
    return {"error": 0}


@router.post("/orders/drafts/{draft_id}/onlyoffice/forcesave")
async def draft_onlyoffice_forcesave(
    draft_id: str,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    order_draft_service.get_draft_path(draft_id)
    if not data.document_key.startswith(f"draft-{draft_id}-"):
        raise HRMSException("Неверный ключ документа OnlyOffice", "invalid_onlyoffice_key", status_code=422)
    await onlyoffice_service.force_save(data.document_key)
    return {"message": "save_requested"}


@router.post("/orders/drafts/{draft_id}/commit")
async def commit_order_draft(
    draft_id: str,
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    order_draft_service.get_draft_path(draft_id)
    order = await order_service.create_order(db, data.model_copy(update={"draft_id": draft_id}))
    return order_service._serialize_order(order)


@router.delete("/orders/drafts/{draft_id}")
async def delete_order_draft(
    draft_id: str,
    current_user: str = Depends(_get_current_user_stub),
):
    order_draft_service.delete_draft(draft_id)
    return {"message": "Черновик удален"}


@router.get("/order-types/{order_type_id}/onlyoffice/config")
async def template_onlyoffice_config(
    order_type_id: int,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    order_type = await order_service.order_type_repo.get_by_id(db, order_type_id)
    if not order_type:
        raise HRMSException("Тип приказа не найден", "order_type_not_found", status_code=404)
    file_path = order_service._get_template_path(order_type)
    if not file_path.exists():
        raise HRMSException("Шаблон не найден", "template_not_found", status_code=404)

    config = onlyoffice_service.build_config(
        doc_type="template",
        doc_id=order_type_id,
        file_path=file_path,
        title=file_path.name,
        callback_url=_public_api_url(f"/order-types/{order_type_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/order-types/{order_type_id}/onlyoffice/file"),
        mode=mode,
    )
    config["documentServerUrl"] = settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
    return config


@router.get("/order-types/{order_type_id}/onlyoffice/file")
async def template_onlyoffice_file(
    order_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order_type = await order_service.order_type_repo.get_by_id(db, order_type_id)
    if not order_type:
        raise HRMSException("Тип приказа не найден", "order_type_not_found", status_code=404)
    file_path = order_service._get_template_path(order_type)
    if not file_path.exists():
        raise HRMSException("Шаблон не найден", "template_not_found", status_code=404)
    return _file_response(file_path)


@router.post("/order-types/{order_type_id}/onlyoffice/callback")
async def template_onlyoffice_callback(
    order_type_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()
    _assert_valid_callback_token(request, body)

    if body.get("status") in (2, 6) and body.get("url"):
        order_type = await order_service.order_type_repo.get_by_id(db, order_type_id)
        if order_type:
            file_path = order_service._get_template_path(order_type)
            await onlyoffice_service.download_and_replace(str(body["url"]), file_path)
    return {"error": 0}


@router.post("/order-types/{order_type_id}/onlyoffice/forcesave")
async def template_onlyoffice_forcesave(
    order_type_id: int,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    if not data.document_key.startswith(f"template-{order_type_id}-"):
        raise HRMSException("Неверный ключ документа OnlyOffice", "invalid_onlyoffice_key", status_code=422)
    await onlyoffice_service.force_save(data.document_key)
    return {"message": "save_requested"}
