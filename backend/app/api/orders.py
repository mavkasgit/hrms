import urllib.parse
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from starlette.responses import Response


class UTF8FileResponse(FileResponse):
    """FileResponse that supports UTF-8 filenames via RFC 5987."""

    def __init__(
        self,
        path: str | Path,
        filename: str | None = None,
        media_type: str | None = None,
        **kwargs,
    ):
        self.utf8_filename = filename
        super().__init__(path=path, filename=filename, media_type=media_type, **kwargs)

    def init_headers(self, headers: dict[str, str] | None = None) -> None:
        super().init_headers(headers)
        if self.utf8_filename:
            encoded = urllib.parse.quote(self.utf8_filename)
            # Override Content-Disposition with RFC 5987 UTF-8 encoding
            # Set raw bytes to bypass Starlette's latin-1 encoding
            self.headers.raw.append(
                (
                    b"content-disposition",
                    f'attachment; filename="{self.utf8_filename}"; filename*=UTF-8\'\'{encoded}'.encode("utf-8"),
                )
            )
            # Remove the latin-1 encoded version that super() added
            keys_to_remove = [k for k in self.headers if k.lower() == "content-disposition"]
            if len(keys_to_remove) > 1:
                for k in keys_to_remove[:-1]:
                    del self.headers[k]

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import HRMSException
from app.core.paths import storage_path
from app.schemas.order import (
    OrderCreate,
    OrderListResponse,
    OrderResponse,
    OrderSettingsResponse,
    OrderSettingsUpdate,
    OrderSyncResponse,
    OrderUpdate,
    VacationUnpaidGroupOrderCreate,
)
from app.schemas.order_type import OrderTypeListResponse
from app.services.order_service import order_service

router = APIRouter(prefix="/orders", tags=["orders"])


class OrderDeletionPreview(BaseModel):
    order_id: int
    order_number: str
    order_type_name: str
    employee_name: str | None
    order_date: str
    has_vacations: bool
    vacation_count: int
    has_transactions: bool
    transaction_count: int
    has_adjustments: bool
    adjustment_count: int
    warnings: list[str] = []


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


@router.post("/vacation-unpaid/group", status_code=201)
async def create_vacation_unpaid_group_order(
    data: VacationUnpaidGroupOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order = await order_service.create_vacation_unpaid_group_order(db, data)
    return order_service._serialize_order(order)


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
    order_letter: Optional[str] = Query(None),
    employee_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    order_number: Optional[str] = Query(None),
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
        order_letter=order_letter,
        employee_id=employee_id,
        date_from=date_from,
        date_to=date_to,
        order_number=order_number,
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


@router.get("/{order_id}/deletion-preview", response_model=OrderDeletionPreview)
async def get_order_deletion_preview(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    from sqlalchemy import select, func
    from app.models.order import Order
    from app.models.vacation import Vacation
    from app.models.vacation_period_transaction import VacationPeriodTransaction
    from app.models.vacation_adjustment import VacationAdjustment

    order = await order_service.get_by_id(db, order_id)
    if not order:
        raise HRMSException("Приказ не найден", "order_not_found", status_code=404)

    # Считаем отпуска
    vac_result = await db.execute(
        select(func.count(Vacation.id)).where(Vacation.order_id == order_id)
    )
    vac_count = vac_result.scalar() or 0

    # Считаем транзакции по original_order_id
    tx_result = await db.execute(
        select(func.count(VacationPeriodTransaction.id)).where(
            VacationPeriodTransaction.original_order_id == order_id
        )
    )
    tx_count = tx_result.scalar() or 0

    # Считаем adjustments по original_order_id
    adj_result = await db.execute(
        select(func.count(VacationAdjustment.id)).where(
            VacationAdjustment.original_order_id == order_id
        )
    )
    adj_count = adj_result.scalar() or 0

    warnings: list[str] = []
    if vac_count > 0:
        warnings.append(f"Будет удалено {vac_count} отпусков, связанных с приказом")
    if tx_count > 0:
        warnings.append(f"Будет удалено {tx_count} транзакций в периодах")
    if adj_count > 0:
        warnings.append(f"Будет удалено {adj_count} корректировок отпуска")

    return OrderDeletionPreview(
        order_id=order.id,
        order_number=order.order_number,
        order_type_name=order.order_type.name if getattr(order, "order_type", None) else "",
        employee_name=order.employee.name if getattr(order, "employee", None) else None,
        order_date=str(order.order_date),
        has_vacations=vac_count > 0,
        vacation_count=vac_count,
        has_transactions=tx_count > 0,
        transaction_count=tx_count,
        has_adjustments=adj_count > 0,
        adjustment_count=adj_count,
        warnings=warnings,
    )


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

    return UTF8FileResponse(
        path=str(file_path),
        filename=order.display_name or file_path.name,
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
