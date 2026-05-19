from pathlib import Path
from typing import Any
from datetime import date
import ipaddress
import json
import logging
import uuid
import shutil
import asyncio
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import EmployeeNotFoundError, HRMSException
from app.core.paths import storage_path, storage_root
from app.schemas.order import GroupOrderCreate, OrderCreate
from app.services.order_document_service import get_template_path
from app.services.onlyoffice_service import onlyoffice_service
from app.services.order_draft_service import order_draft_service
from app.services.order_service import order_service
from app.services.docx_renderer import load_template_or_create_blank, render_docx_placeholders, build_basic_doc_replacements
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
    return FileResponse(
        str(file_path),
        media_type=DOCX_MEDIA_TYPE,
    )


@router.get("/orders/{order_id}/onlyoffice/config")
async def order_onlyoffice_config(
    order_id: int,
    request: Request,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    order = await order_service.get_by_id(db, order_id)
    if not order.file_path:
        raise HRMSException("Файл приказа не найден", "order_file_not_found", status_code=404)
    file_path = storage_path(order.file_path, "ORDERS_PATH")
    if not file_path.exists():
        raise HRMSException("Файл приказа отсутствует на диске", "order_file_missing", status_code=404)

    config = onlyoffice_service.build_config(
        doc_type="order",
        doc_id=order_id,
        file_path=file_path,
        title=order.file_path.split("/")[-1],
        callback_url=_public_api_url(f"/orders/{order_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/orders/{order_id}/onlyoffice/file"),
        mode=mode,
    )
    config["documentServerUrl"] = _document_server_url(request)
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
    file_path = storage_path(order.file_path, "ORDERS_PATH")
    if not file_path.exists():
        raise HRMSException("Файл приказа отсутствует на диске", "order_file_missing", status_code=404)
    return _file_response(file_path)


logger = logging.getLogger(__name__)


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
    status = body.get("status")
    logger.info("[order callback] order_id=%s status=%s url=%s", order_id, status, body.get("url"))

    try:
        _assert_valid_callback_token(request, body)
    except HRMSException as exc:
        logger.warning("[order callback] invalid token for order_id=%s: %s", order_id, exc.detail)
        return JSONResponse(content={"error": 1, "message": str(exc.detail)}, status_code=exc.status_code)

    if status in (2, 6) and body.get("url"):
        try:
            order = await order_service.get_by_id(db, order_id)
            if order and order.file_path:
                file_path = storage_path(order.file_path, "ORDERS_PATH")
                await onlyoffice_service.download_and_replace(str(body["url"]), file_path)
                logger.info("[order callback] saved successfully order_id=%s", order_id)
            else:
                logger.warning("[order callback] order or file_path missing order_id=%s", order_id)
        except Exception as exc:
            logger.error("[order callback] failed to save order_id=%s: %s", order_id, exc, exc_info=True)
            return JSONResponse(content={"error": 1, "message": str(exc)}, status_code=500)
    elif status == 7:
        logger.warning("[order callback] force save error for order_id=%s", order_id)

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

    employee = None
    if data.employee_id is not None:
        employee = await order_service.get_employee_by_id(db, data.employee_id)
        if not employee:
            raise EmployeeNotFoundError(data.employee_id)

    order_type = await order_service.get_order_type_by_id(db, data.order_type_id)
    if not order_type or not order_type.is_active:
        raise HRMSException("Активный тип приказа не найден", "order_type_not_found", status_code=404)

    if not data.order_number:
        order_number = await order_service.get_next_number(db, data.order_type_id)
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
    request: Request,
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
        allow_print=False,
    )
    config["documentServerUrl"] = _document_server_url(request)
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


@router.post("/orders/group-drafts")
async def create_order_group_draft(
    data: GroupOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    await order_service.ensure_default_order_types(db)

    order_type = await order_service.get_order_type_by_code(db, data.order_type_code)
    if not order_type or not order_type.is_active:
        raise HRMSException("Активный тип приказа не найден", "order_type_not_found", status_code=404)

    # Load employees and attach to payload
    employees_with_objs = []
    for emp_item in data.employees:
        employee = await order_service.get_employee_by_id(db, emp_item["employee_id"])
        if not employee:
            raise EmployeeNotFoundError(emp_item["employee_id"])
        employees_with_objs.append({
            "employee_id": emp_item["employee_id"],
            "vacation_days": emp_item["vacation_days"],
            "employee": employee,
        })

    # Build payload for draft service
    payload = data.model_dump(exclude_unset=True)
    # Replace employee IDs with full employee objects for rendering
    payload["employees"] = employees_with_objs

    draft = await order_draft_service.create_group_draft(
        order_type_code=data.order_type_code,
        payload=payload,
        order_type=order_type,
        user_id=current_user,
    )

    return {
        "draft_id": draft["draft_id"],
        "edit_url": f"/orders/drafts/{draft['draft_id']}/edit-docx",
    }


@router.post("/orders/group-drafts/{draft_id}/commit")
async def commit_group_order_draft(
    draft_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()

    order = await order_service.create_group_order_from_draft(
        db=db,
        draft_id=draft_id,
    )

    try:
        order_draft_service.delete_draft(draft_id)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Failed to delete committed group draft %s", draft_id)

    return order_service._serialize_order(order)


@router.get("/order-types/{order_type_id}/onlyoffice/config")
async def template_onlyoffice_config(
    order_type_id: int,
    request: Request,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    order_type = await order_service.get_order_type_by_id(db, order_type_id)
    if not order_type:
        raise HRMSException("Тип приказа не найден", "order_type_not_found", status_code=404)
    file_path = get_template_path(order_type)
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
    config["documentServerUrl"] = _document_server_url(request)
    return config


@router.get("/order-types/{order_type_id}/onlyoffice/file")
async def template_onlyoffice_file(
    order_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order_type = await order_service.get_order_type_by_id(db, order_type_id)
    if not order_type:
        raise HRMSException("Тип приказа не найден", "order_type_not_found", status_code=404)
    file_path = get_template_path(order_type)
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
        order_type = await order_service.get_order_type_by_id(db, order_type_id)
        if order_type:
            file_path = get_template_path(order_type)
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


# ─── Notifications OnlyOffice ──────────────────────────────────────────────────

import uuid
import shutil
from pathlib import Path

from app.core.paths import notifications_path
from app.models.notification import Notification


@router.post("/notifications/drafts")
async def create_notification_draft(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()

    draft_id = str(uuid.uuid4())
    notifications_dir = storage_root("NOTIFICATIONS_PATH")
    notifications_dir.mkdir(parents=True, exist_ok=True)
    file_path = notifications_dir / f"{draft_id}.docx"

    # Load template or create blank, then apply basic placeholders
    default_template = notifications_dir / "template.docx"
    if default_template.exists():
        doc = await load_template_or_create_blank(default_template)
        replacements = build_basic_doc_replacements(
            title="Новое уведомление",
            date_str=date.today().strftime("%d.%m.%Y"),
        )
        render_docx_placeholders(doc, replacements)
        await asyncio.wait_for(
            asyncio.to_thread(doc.save, str(file_path)),
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
        )
    else:
        try:
            from docx import Document
            doc = Document()
            doc.save(str(file_path))
        except ImportError:
            raise HRMSException("Шаблон уведомления не найден", "template_not_found", status_code=404)

    notification = Notification(
        title="Новое уведомление",
        date=date.today(),
        file_path=file_path.name,
        is_draft=True,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    return {"draft_id": str(notification.id), "notification_id": notification.id}


@router.get("/notifications/{notification_id}/onlyoffice/config")
async def notification_onlyoffice_config(
    notification_id: int,
    request: Request,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    notification = await db.get(Notification, notification_id)
    if not notification:
        raise HRMSException("Уведомление не найдено", "notification_not_found", status_code=404)
    if not notification.file_path:
        raise HRMSException("Файл уведомления не найден", "notification_file_not_found", status_code=404)
    file_path = notifications_path(notification.file_path)
    if not file_path.exists():
        raise HRMSException("Файл уведомления отсутствует на диске", "notification_file_missing", status_code=404)

    config = onlyoffice_service.build_config(
        doc_type="notification",
        doc_id=notification_id,
        file_path=file_path,
        title=notification.file_path.split("/")[-1],
        callback_url=_public_api_url(f"/notifications/{notification_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/notifications/{notification_id}/onlyoffice/file"),
        mode=mode,
    )
    config["documentServerUrl"] = _document_server_url(request)
    return config


@router.get("/notifications/{notification_id}/onlyoffice/file")
async def notification_onlyoffice_file(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    notification = await db.get(Notification, notification_id)
    if not notification:
        raise HRMSException("Уведомление не найдено", "notification_not_found", status_code=404)
    if not notification.file_path:
        raise HRMSException("Файл уведомления не найден", "notification_file_not_found", status_code=404)
    file_path = notifications_path(notification.file_path)
    if not file_path.exists():
        raise HRMSException("Файл уведомления отсутствует на диске", "notification_file_missing", status_code=404)
    return _file_response(file_path)


@router.post("/notifications/{notification_id}/onlyoffice/callback")
async def notification_onlyoffice_callback(
    notification_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()
    status = body.get("status")

    try:
        _assert_valid_callback_token(request, body)
    except HRMSException as exc:
        return JSONResponse(content={"error": 1, "message": str(exc.detail)}, status_code=exc.status_code)

    if status in (2, 6) and body.get("url"):
        try:
            notification = await db.get(Notification, notification_id)
            if notification and notification.file_path:
                file_path = notifications_path(notification.file_path)
                await onlyoffice_service.download_and_replace(str(body["url"]), file_path)
                if notification.is_draft:
                    notification.is_draft = False
                    await db.commit()
        except Exception as exc:
            return JSONResponse(content={"error": 1, "message": str(exc)}, status_code=500)

    return {"error": 0}


@router.post("/notifications/{notification_id}/onlyoffice/forcesave")
async def notification_onlyoffice_forcesave(
    notification_id: int,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    if not data.document_key.startswith(f"notification-{notification_id}-"):
        raise HRMSException("Неверный ключ документа OnlyOffice", "invalid_onlyoffice_key", status_code=422)
    await onlyoffice_service.force_save(data.document_key)
    return {"message": "save_requested"}


# ─── Statements OnlyOffice ─────────────────────────────────────────────────────

from app.core.paths import statements_path
from app.models.statement import Statement


@router.post("/statements/drafts")
async def create_statement_draft(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()

    draft_id = str(uuid.uuid4())
    statements_dir = storage_root("STATEMENTS_PATH")
    statements_dir.mkdir(parents=True, exist_ok=True)
    file_path = statements_dir / f"{draft_id}.docx"

    default_template = statements_dir / "template.docx"
    if default_template.exists():
        doc = await load_template_or_create_blank(default_template)
        replacements = build_basic_doc_replacements(
            title="Новое заявление",
            date_str=date.today().strftime("%d.%m.%Y"),
        )
        render_docx_placeholders(doc, replacements)
        await asyncio.wait_for(
            asyncio.to_thread(doc.save, str(file_path)),
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
        )
    else:
        try:
            from docx import Document
            doc = Document()
            doc.save(str(file_path))
        except ImportError:
            raise HRMSException("Шаблон заявления не найден", "template_not_found", status_code=404)

    statement = Statement(
        title="Новое заявление",
        date=date.today(),
        file_path=file_path.name,
        is_draft=True,
    )
    db.add(statement)
    await db.commit()
    await db.refresh(statement)

    return {"draft_id": str(statement.id), "statement_id": statement.id}


@router.get("/statements/{statement_id}/onlyoffice/config")
async def statement_onlyoffice_config(
    statement_id: int,
    request: Request,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    statement = await db.get(Statement, statement_id)
    if not statement:
        raise HRMSException("Заявление не найдено", "statement_not_found", status_code=404)
    if not statement.file_path:
        raise HRMSException("Файл заявления не найден", "statement_file_not_found", status_code=404)
    file_path = statements_path(statement.file_path)
    if not file_path.exists():
        raise HRMSException("Файл заявления отсутствует на диске", "statement_file_missing", status_code=404)

    config = onlyoffice_service.build_config(
        doc_type="statement",
        doc_id=statement_id,
        file_path=file_path,
        title=statement.file_path.split("/")[-1],
        callback_url=_public_api_url(f"/statements/{statement_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/statements/{statement_id}/onlyoffice/file"),
        mode=mode,
    )
    config["documentServerUrl"] = _document_server_url(request)
    return config


@router.get("/statements/{statement_id}/onlyoffice/file")
async def statement_onlyoffice_file(
    statement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    statement = await db.get(Statement, statement_id)
    if not statement:
        raise HRMSException("Заявление не найдено", "statement_not_found", status_code=404)
    if not statement.file_path:
        raise HRMSException("Файл заявления не найден", "statement_file_not_found", status_code=404)
    file_path = statements_path(statement.file_path)
    if not file_path.exists():
        raise HRMSException("Файл заявления отсутствует на диске", "statement_file_missing", status_code=404)
    return _file_response(file_path)


@router.post("/statements/{statement_id}/onlyoffice/callback")
async def statement_onlyoffice_callback(
    statement_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()
    status = body.get("status")

    try:
        _assert_valid_callback_token(request, body)
    except HRMSException as exc:
        return JSONResponse(content={"error": 1, "message": str(exc.detail)}, status_code=exc.status_code)

    if status in (2, 6) and body.get("url"):
        try:
            statement = await db.get(Statement, statement_id)
            if statement and statement.file_path:
                file_path = statements_path(statement.file_path)
                await onlyoffice_service.download_and_replace(str(body["url"]), file_path)
                if statement.is_draft:
                    statement.is_draft = False
                    await db.commit()
        except Exception as exc:
            return JSONResponse(content={"error": 1, "message": str(exc)}, status_code=500)

    return {"error": 0}


@router.post("/statements/{statement_id}/onlyoffice/forcesave")
async def statement_onlyoffice_forcesave(
    statement_id: int,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    if not data.document_key.startswith(f"statement-{statement_id}-"):
        raise HRMSException("Неверный ключ документа OnlyOffice", "invalid_onlyoffice_key", status_code=422)
    await onlyoffice_service.force_save(data.document_key)
    return {"message": "save_requested"}
