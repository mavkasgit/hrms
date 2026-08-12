from pathlib import Path
from typing import Any
import ipaddress
import json
import logging
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import HRMSException
from app.core.paths import storage_path
from app.schemas.notification import NotificationCreate
from app.schemas.order import GroupOrderCreate, OrderCreate
from app.schemas.statement import StatementCreate
from app.services.order_document_service import get_template_path
from app.services.onlyoffice_callback_pipeline import (
    CallbackKind,
    CallbackContext,
    CallbackResult,
    onlyoffice_callback_pipeline,
)
from app.services.onlyoffice_save_tracker import onlyoffice_save_tracker
from app.services.onlyoffice_service import onlyoffice_service, editor_user
from app.services.order_draft_service import order_draft_service
from app.services.draft_adapter import draft_application_facade
from app.services.draft_ref import DraftRef
from app.services.onlyoffice_form_data import (
    draft_form_data as build_draft_form_data,
    notification_form_data as build_notification_form_data,
    order_form_data as build_order_form_data,
    statement_form_data as build_statement_form_data,
)
from app.services.unified_drafts_service import unified_drafts_service
from app.services.order_service import order_service
from app.services.order_draft_application_service import (
    CreateGroupOrderDraftCommand,
    CreateOrderDraftCommand,
    order_draft_application_service,
)
from app.services.document_draft_application_service import (
    CreateNotificationDraftCommand,
    CreateStatementDraftCommand,
    notification_draft_application_service,
    statement_draft_application_service,
)
from app.models.notification import Notification
from app.models.statement import Statement

router = APIRouter(tags=["onlyoffice"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class OnlyOfficeForceSaveRequest(BaseModel):
    document_key: str
    save_id: str | None = None


class OnlyOfficeSaveReportRequest(BaseModel):
    reason: str


from app.api.deps import (
    CurrentUser,
    get_current_user as _get_current_user_stub,
    get_current_user_or_onlyoffice,
)


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
    #   - Frontend: Vite dev server on localhost:5171
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


def _extract_callback_userdata(body: dict[str, Any]) -> str | None:
    """userdata from forcesave CommandService is echoed on callback (top-level)."""
    userdata = body.get("userdata")
    if userdata is None or userdata == "":
        return None
    return str(userdata)


def _callback_result_response(result: CallbackResult) -> dict[str, Any] | JSONResponse:
    """Map pipeline CallbackResult to the callback HTTP contract (ADR-0006).

    Единый маппинг для всех видов: http_error=0 → 200 error:0, http_error=1 → 500 error:1.
    """
    if result.http_error == 0:
        return {"error": 0}
    return JSONResponse(content={"error": 1, "message": result.error or "onlyoffice_callback_failed"}, status_code=500)


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
    current_user: CurrentUser = Depends(_get_current_user_stub),
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
        title=file_path.name,
        callback_url=_public_api_url(f"/orders/{order_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/orders/{order_id}/onlyoffice/file"),
        mode=mode,
        data=build_order_form_data(order),
        user=editor_user(current_user),
    )
    config["documentServerUrl"] = _document_server_url(request)
    return config


@router.get("/orders/{order_id}/onlyoffice/file")
async def order_onlyoffice_file(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user_or_onlyoffice),
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
    current_user: str = Depends(get_current_user_or_onlyoffice),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()
    userdata = _extract_callback_userdata(body)
    logger.info(
        "[order callback] order_id=%s status=%s url=%s userdata=%s",
        order_id,
        body.get("status"),
        body.get("url"),
        userdata,
    )

    try:
        _assert_valid_callback_token(request, body)
    except HRMSException as exc:
        logger.warning("[order callback] invalid token for order_id=%s: %s", order_id, exc.detail)
        return JSONResponse(content={"error": 1, "message": str(exc.detail)}, status_code=exc.status_code)

    context = CallbackContext(kind=CallbackKind.ORDER, entity_id=order_id, db=db, userdata=userdata)
    result = await onlyoffice_callback_pipeline.handle_callback(context, body)
    return _callback_result_response(result)


@router.post("/orders/{order_id}/onlyoffice/forcesave")
async def order_onlyoffice_forcesave(
    order_id: int,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    if not data.document_key.startswith(f"order-{order_id}-"):
        raise HRMSException("Неверный ключ документа OnlyOffice", "invalid_onlyoffice_key", status_code=422)
    context = CallbackContext(kind=CallbackKind.ORDER, entity_id=order_id, db=None, userdata=data.save_id)
    return await onlyoffice_callback_pipeline.request_forcesave(context, data.document_key)


@router.get("/orders/{order_id}/onlyoffice/save-status/{save_id}")
async def order_onlyoffice_save_status(
    order_id: int,
    save_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    await order_service.get_by_id(db, order_id)
    return await onlyoffice_save_tracker.get(save_id)


@router.get("/orders/drafts")
async def list_order_drafts(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    return await unified_drafts_service.list_order_drafts(db)


@router.get("/drafts")
async def list_all_drafts(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Объединённый список всех черновиков: приказы, уведомления, заявления."""
    _ensure_onlyoffice_enabled()
    return await draft_application_facade.list(db)


@router.get("/drafts/{draft_id}/form-data")
async def draft_form_data(
    draft_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Данные черновика для кнопки «Заполнить поля» (пересоздание документа).

    Сборка — в app.services.unified_drafts_service / onlyoffice_form_data
    (единый источник для конфига OnlyOffice).
    """
    _ensure_onlyoffice_enabled()
    return await unified_drafts_service.get_draft_form_data(db, draft_id)


@router.post("/orders/drafts")
async def create_order_draft(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Создать черновик приказа (подготовка — в OrderDraftApplicationService, #97)."""
    _ensure_onlyoffice_enabled()
    return await order_draft_application_service.create_draft(
        db,
        CreateOrderDraftCommand(data=data, user_id=current_user),
    )


@router.get("/orders/drafts/{draft_id}/onlyoffice/config")
async def draft_onlyoffice_config(
    draft_id: str,
    request: Request,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    current_user: CurrentUser = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    file_path = order_draft_service.get_draft_path(draft_id)
    try:
        meta = order_draft_service.read_draft_metadata(draft_id)
        form_data = build_draft_form_data(meta)
    except HRMSException:
        # Старые черновики без метаданных открываются без предзаполнения.
        form_data = []
    config = onlyoffice_service.build_config(
        doc_type="draft",
        doc_id=draft_id,
        file_path=file_path,
        title=file_path.name,
        callback_url=_public_api_url(f"/orders/drafts/{draft_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/orders/drafts/{draft_id}/file"),
        mode=mode,
        allow_print=False,
        data=form_data or None,
        user=editor_user(current_user),
    )
    config["documentServerUrl"] = _document_server_url(request)
    return config


@router.get("/orders/drafts/{draft_id}/file")
async def draft_onlyoffice_file(
    draft_id: str,
    current_user: str = Depends(get_current_user_or_onlyoffice),
):
    return _file_response(order_draft_service.get_draft_path(draft_id))


@router.post("/orders/drafts/{draft_id}/onlyoffice/callback")
async def draft_onlyoffice_callback(
    draft_id: str,
    request: Request,
    current_user: str = Depends(get_current_user_or_onlyoffice),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()
    userdata = _extract_callback_userdata(body)
    logger.info(
        "[draft callback] draft_id=%s status=%s url=%s userdata=%s",
        draft_id,
        body.get("status"),
        body.get("url"),
        userdata,
    )

    try:
        _assert_valid_callback_token(request, body)
    except HRMSException as exc:
        logger.warning("[draft callback] invalid token for draft_id=%s: %s", draft_id, exc.detail)
        return JSONResponse(content={"error": 1, "message": str(exc.detail)}, status_code=exc.status_code)

    context = CallbackContext(kind=CallbackKind.ORDER_DRAFT, entity_id=draft_id, db=None, userdata=userdata)
    result = await onlyoffice_callback_pipeline.handle_callback(context, body)
    return _callback_result_response(result)


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
    context = CallbackContext(kind=CallbackKind.ORDER_DRAFT, entity_id=draft_id, db=None, userdata=data.save_id)
    return await onlyoffice_callback_pipeline.request_forcesave(context, data.document_key)


@router.get("/orders/drafts/{draft_id}/onlyoffice/save-status/{save_id}")
async def draft_onlyoffice_save_status(
    draft_id: str,
    save_id: str,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    order_draft_service.get_draft_path(draft_id)
    return await onlyoffice_save_tracker.get(save_id)


@router.post("/orders/drafts/{draft_id}/save-report")
async def draft_onlyoffice_save_report(
    draft_id: str,
    data: OnlyOfficeSaveReportRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    """Зафиксировать ошибку сохранения, которую увидел клиент (#53)."""
    _ensure_onlyoffice_enabled()
    order_draft_service.get_draft_path(draft_id)
    reason = data.reason.strip()
    if reason:
        await order_draft_service.update_save_status(draft_id, state="error", error=reason)
    return {"message": "ok"}


@router.post("/orders/drafts/{draft_id}/commit")
async def commit_order_draft(
    draft_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    return await draft_application_facade.commit(db, current_user, DraftRef.order(draft_id))


@router.delete("/orders/drafts/{draft_id}", status_code=204)
async def delete_order_draft(
    draft_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await draft_application_facade.delete_draft(db, current_user, DraftRef.order(draft_id))


@router.post("/orders/group-drafts")
async def create_order_group_draft(
    data: GroupOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Создать групповой черновик приказа (подготовка — в OrderDraftApplicationService, #97)."""
    _ensure_onlyoffice_enabled()
    draft = await order_draft_application_service.create_group_draft(
        db,
        CreateGroupOrderDraftCommand(data=data, user_id=current_user),
    )
    return {
        "draft_id": draft["draft_id"],
        "edit_url": f"/drafts/{draft['draft_id']}/edit-docx",
    }


@router.post("/orders/group-drafts/{draft_id}/commit")
async def commit_group_order_draft(
    draft_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    return await draft_application_facade.commit(db, current_user, DraftRef.order(draft_id))


@router.get("/order-types/{order_type_id}/onlyoffice/config")
async def template_onlyoffice_config(
    order_type_id: int,
    request: Request,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(_get_current_user_stub),
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
        user=editor_user(current_user),
    )
    config["documentServerUrl"] = _document_server_url(request)
    return config


@router.get("/order-types/{order_type_id}/onlyoffice/file")
async def template_onlyoffice_file(
    order_type_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user_or_onlyoffice),
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
    current_user: str = Depends(get_current_user_or_onlyoffice),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()

    try:
        _assert_valid_callback_token(request, body)
    except HRMSException as exc:
        return JSONResponse(content={"error": 1, "message": str(exc.detail)}, status_code=exc.status_code)

    context = CallbackContext(
        kind=CallbackKind.TEMPLATE,
        entity_id=order_type_id,
        db=db,
        userdata=_extract_callback_userdata(body),
    )
    result = await onlyoffice_callback_pipeline.handle_callback(context, body)
    return _callback_result_response(result)


@router.post("/order-types/{order_type_id}/onlyoffice/forcesave")
async def template_onlyoffice_forcesave(
    order_type_id: int,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    if not data.document_key.startswith(f"template-{order_type_id}-"):
        raise HRMSException("Неверный ключ документа OnlyOffice", "invalid_onlyoffice_key", status_code=422)
    context = CallbackContext(
        kind=CallbackKind.TEMPLATE,
        entity_id=order_type_id,
        db=None,
        userdata=data.save_id,
    )
    return await onlyoffice_callback_pipeline.request_forcesave(context, data.document_key)


# ─── Notifications OnlyOffice ──────────────────────────────────────────────────

from app.core.paths import notifications_path


@router.post("/notifications/drafts")
async def create_notification_draft(
    data: NotificationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Создать черновик уведомления (делегирование — в NotificationDraftApplicationService, #97)."""
    _ensure_onlyoffice_enabled()
    return await notification_draft_application_service.create_draft(
        db,
        CreateNotificationDraftCommand(data=data),
    )


@router.get("/notifications/{notification_id}/onlyoffice/config")
async def notification_onlyoffice_config(
    notification_id: int,
    request: Request,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(_get_current_user_stub),
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
        title=file_path.name,
        callback_url=_public_api_url(f"/notifications/{notification_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/notifications/{notification_id}/onlyoffice/file"),
        mode=mode,
        data=build_notification_form_data(notification),
        user=editor_user(current_user),
    )
    config["documentServerUrl"] = _document_server_url(request)
    return config


@router.get("/notifications/{notification_id}/onlyoffice/file")
async def notification_onlyoffice_file(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user_or_onlyoffice),
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
    current_user: str = Depends(get_current_user_or_onlyoffice),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()

    try:
        _assert_valid_callback_token(request, body)
    except HRMSException as exc:
        return JSONResponse(content={"error": 1, "message": str(exc.detail)}, status_code=exc.status_code)

    context = CallbackContext(
        kind=CallbackKind.NOTIFICATION,
        entity_id=notification_id,
        db=db,
        userdata=_extract_callback_userdata(body),
    )
    result = await onlyoffice_callback_pipeline.handle_callback(context, body)
    return _callback_result_response(result)


@router.post("/notifications/{notification_id}/onlyoffice/forcesave")
async def notification_onlyoffice_forcesave(
    notification_id: int,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    if not data.document_key.startswith(f"notification-{notification_id}-"):
        raise HRMSException("Неверный ключ документа OnlyOffice", "invalid_onlyoffice_key", status_code=422)
    context = CallbackContext(
        kind=CallbackKind.NOTIFICATION,
        entity_id=notification_id,
        db=None,
        userdata=data.save_id,
    )
    return await onlyoffice_callback_pipeline.request_forcesave(context, data.document_key)


@router.get("/notifications/{notification_id}/onlyoffice/save-status/{save_id}")
async def notification_onlyoffice_save_status(
    notification_id: int,
    save_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    notification = await db.get(Notification, notification_id)
    if not notification:
        raise HRMSException("Уведомление не найдено", "notification_not_found", status_code=404)
    return await onlyoffice_save_tracker.get(save_id)


@router.post("/notifications/{notification_id}/commit")
async def commit_notification_draft(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Явный commit черновика уведомления из редактора (#86): is_draft=False.

    Детерминирован в отличие от callback-финализации: не зависит от того,
    правил ли пользователь документ (no_changes) — файл уже персистен.
    """
    _ensure_onlyoffice_enabled()
    return await draft_application_facade.commit(db, current_user, DraftRef.notification(notification_id))


# ─── Statements OnlyOffice ─────────────────────────────────────────────────────

from app.core.paths import statements_path


@router.post("/statements/drafts")
async def create_statement_draft(
    data: StatementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Создать черновик заявления (делегирование — в StatementDraftApplicationService, #97)."""
    _ensure_onlyoffice_enabled()
    return await statement_draft_application_service.create_draft(
        db,
        CreateStatementDraftCommand(data=data),
    )


@router.get("/statements/{statement_id}/onlyoffice/config")
async def statement_onlyoffice_config(
    statement_id: int,
    request: Request,
    mode: str = Query("edit", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(_get_current_user_stub),
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
        title=file_path.name,
        callback_url=_public_api_url(f"/statements/{statement_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/statements/{statement_id}/onlyoffice/file"),
        mode=mode,
        data=build_statement_form_data(statement),
        user=editor_user(current_user),
    )
    config["documentServerUrl"] = _document_server_url(request)
    return config


@router.get("/statements/{statement_id}/onlyoffice/file")
async def statement_onlyoffice_file(
    statement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user_or_onlyoffice),
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
    current_user: str = Depends(get_current_user_or_onlyoffice),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()

    try:
        _assert_valid_callback_token(request, body)
    except HRMSException as exc:
        return JSONResponse(content={"error": 1, "message": str(exc.detail)}, status_code=exc.status_code)

    context = CallbackContext(
        kind=CallbackKind.STATEMENT,
        entity_id=statement_id,
        db=db,
        userdata=_extract_callback_userdata(body),
    )
    result = await onlyoffice_callback_pipeline.handle_callback(context, body)
    return _callback_result_response(result)


@router.post("/statements/{statement_id}/onlyoffice/forcesave")
async def statement_onlyoffice_forcesave(
    statement_id: int,
    data: OnlyOfficeForceSaveRequest,
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    if not data.document_key.startswith(f"statement-{statement_id}-"):
        raise HRMSException("Неверный ключ документа OnlyOffice", "invalid_onlyoffice_key", status_code=422)
    context = CallbackContext(
        kind=CallbackKind.STATEMENT,
        entity_id=statement_id,
        db=None,
        userdata=data.save_id,
    )
    return await onlyoffice_callback_pipeline.request_forcesave(context, data.document_key)


@router.get("/statements/{statement_id}/onlyoffice/save-status/{save_id}")
async def statement_onlyoffice_save_status(
    statement_id: int,
    save_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    _ensure_onlyoffice_enabled()
    statement = await db.get(Statement, statement_id)
    if not statement:
        raise HRMSException("Заявление не найдено", "statement_not_found", status_code=404)
    return await onlyoffice_save_tracker.get(save_id)


@router.post("/statements/{statement_id}/commit")
async def commit_statement_draft(
    statement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Явный commit черновика заявления из редактора (#86): is_draft=False."""
    _ensure_onlyoffice_enabled()
    return await draft_application_facade.commit(db, current_user, DraftRef.statement(statement_id))
