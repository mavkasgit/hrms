from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import HRMSException
from app.core.paths import storage_path
from app.schemas.order import (
    OrderCreate,
    OrderListResponse,
    OrderPreviewResponse,
    OrderResponse,
    OrderSettingsResponse,
    OrderSettingsUpdate,
    OrderSyncResponse,
    OrderUpdate,
)
from app.schemas.order_type import OrderTypeListResponse
from app.services.order_service import order_service

router = APIRouter(prefix="/orders", tags=["orders"])


def _get_current_user_stub() -> str:
    return "admin"


@router.get("/types", response_model=OrderTypeListResponse)
async def get_order_types(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return {
        "items": await order_service.get_order_types(
            db,
            active_only=active_only,
            show_in_orders_page=True,
        )
    }


@router.get("/next-number")
async def get_next_order_number(
    order_type_id: int = Query(..., gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    number = await order_service.get_next_number(db, order_type_id)
    return {"order_number": number}


@router.post("", response_model=OrderResponse, status_code=201)
async def create_order(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order = await order_service.create_order(db, data)
    return order_service._serialize_order(order)


@router.post("/preview", response_model=OrderPreviewResponse)
async def create_order_preview(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await order_service.generate_order_preview(db, data)


@router.get("/recent")
async def get_recent_orders(
    limit: int = Query(10, ge=1, le=100),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await order_service.get_recent(db, limit=limit, year=year)


@router.get("/all", response_model=OrderListResponse)
async def get_all_orders(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=1000),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
    year: Optional[int] = Query(None),
    order_type_code: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await order_service.get_all(
        db,
        page=page,
        per_page=per_page,
        sort_by=sort_by,
        sort_order=sort_order,
        year=year,
        order_type_code=order_type_code,
    )


@router.get("/years")
async def get_order_years(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    years = await order_service.get_years(db)
    return {"years": years}


@router.get("/log")
async def get_order_log(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await order_service.get_recent(db, limit=100)


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order = await order_service.get_by_id(db, order_id)
    return order_service._serialize_order(order)


@router.get("/settings", response_model=OrderSettingsResponse)
async def get_order_settings(
    current_user: str = Depends(_get_current_user_stub),
):
    from app.core.config import settings

    return {
        "orders_path": settings.ORDERS_PATH,
        "templates_path": settings.TEMPLATES_PATH,
    }


@router.put("/settings", response_model=OrderSettingsResponse)
async def update_order_settings(
    data: OrderSettingsUpdate,
    current_user: str = Depends(_get_current_user_stub),
):
    from app.core.config import settings

    if data.orders_path:
        settings.ORDERS_PATH = data.orders_path
    if data.templates_path:
        settings.TEMPLATES_PATH = data.templates_path
    return {
        "orders_path": settings.ORDERS_PATH,
        "templates_path": settings.TEMPLATES_PATH,
    }


@router.post("/sync", response_model=OrderSyncResponse)
async def sync_orders(
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await order_service.sync_orders(db, year=year)


@router.get("/{order_id}/preview", response_class=HTMLResponse)
async def preview_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    # Quick human-readable HTML view only. Use /orders/{order_id}/view-docx for OnlyOffice view.
    order = await order_service.get_by_id(db, order_id)
    if not order.file_path:
        raise HRMSException("Файл приказа не найден", "order_file_not_found", status_code=404)

    file_path = storage_path(order.file_path, "ORDERS_PATH")
    if not file_path.exists():
        raise HRMSException("Файл приказа отсутствует на диске", "order_file_missing", status_code=404)

    try:
        import mammoth

        with open(file_path, "rb") as docx_file:
            result = mammoth.convert_to_html(docx_file)
            html_content = order_service._style_missing_template_warning_html(result.value)

        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Приказ №{order.order_number}</title>
            <style>
                body {{
                    font-family: 'Times New Roman', serif;
                    max-width: 800px;
                    margin: 20px auto;
                    padding: 20px;
                    background: #f5f5f5;
                }}
                .container {{
                    background: white;
                    padding: 40px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }}
                .missing-template-warning {{
                    color: #dc2626;
                    font-weight: 700;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                {html_content}
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=full_html)
    except Exception as exc:
        raise HRMSException(f"Ошибка при конвертации: {str(exc)}", "conversion_error", status_code=500)


@router.get("/{order_id}/download")
async def download_order(
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

    return FileResponse(
        str(file_path),
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.put("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: int,
    data: OrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order = await order_service.update_order(db, order_id, data, current_user)
    return order_service._serialize_order(order)


@router.put("/{order_id}/cancel")
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await order_service.cancel_order(db, order_id, current_user)
    return {"message": "Приказ отменен"}


@router.delete("/{order_id}")
async def delete_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await order_service.hard_delete_order(db, order_id)
    return {"message": "Приказ удален"}
