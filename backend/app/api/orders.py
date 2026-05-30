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

from app.core.config import settings
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
    WeekendCallGroupOrderCreate,
)
from app.schemas.order_type import OrderTypeListResponse
from app.services.order_service import order_service
from app.services.order_print_service import order_print_service

router = APIRouter(prefix="/orders", tags=["orders"])
PDF_MEDIA_TYPE = "application/pdf"


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


@router.post("/weekend-call/group", status_code=201)
async def create_weekend_call_group_order(
    data: WeekendCallGroupOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order = await order_service.create_weekend_call_group_order(db, data)
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


@router.get("/registry/years")
async def get_registry_years(
    letter: str = Query(..., max_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Return years that have orders with the given letter."""
    from sqlalchemy import select, distinct, extract
    from app.models.order import Order
    from app.models.order_type import OrderType

    result = await db.execute(
        select(distinct(extract("year", Order.order_date)))
        .join(OrderType, Order.order_type_id == OrderType.id)
        .where(
            Order.is_deleted == False,
            OrderType.letter == letter,
        )
        .order_by(extract("year", Order.order_date).desc())
    )
    years = [int(row[0]) for row in result.all() if row[0]]
    return {"years": years}


def _format_date(date_str: str) -> str:
    """Format date string from YYYY-MM-DD to DD.MM.YYYY."""
    if not date_str:
        return ""
    try:
        parts = date_str.split("-")
        if len(parts) == 3:
            return f"{parts[2]}.{parts[1]}.{parts[0]}"
    except Exception:
        pass
    return date_str


def _format_order_period(order_type_code: str, extra_fields: dict) -> str:
    """Format order period string based on order type and extra_fields."""
    if not extra_fields:
        return ""

    if order_type_code == "vacation_paid":
        start = extra_fields.get("vacation_start")
        end = extra_fields.get("vacation_end")
        days = extra_fields.get("vacation_days")
        if start and end:
            period = f"{_format_date(start)} — {_format_date(end)}"
            if days:
                period += f" ({days} дн.)"
            return period

    elif order_type_code == "vacation_recall":
        recall_date = extra_fields.get("recall_date")
        old_start = extra_fields.get("old_vacation_start")
        old_end = extra_fields.get("old_vacation_end")
        if recall_date and old_start and old_end:
            return f"Отзыв: {_format_date(recall_date)} (отпуск: {_format_date(old_start)} — {_format_date(old_end)})"

    elif order_type_code == "vacation_postpone":
        old_start = extra_fields.get("old_vacation_start")
        old_end = extra_fields.get("old_vacation_end")
        new_start = extra_fields.get("new_vacation_start")
        new_end = extra_fields.get("new_vacation_end")
        if old_start and old_end and new_start and new_end:
            return f"{_format_date(old_start)} — {_format_date(old_end)} → {_format_date(new_start)} — {_format_date(new_end)}"

    elif order_type_code == "vacation_extension":
        vac_start = extra_fields.get("vacation_start")
        vac_end = extra_fields.get("vacation_end")
        sick_start = extra_fields.get("sick_start_date")
        sick_end = extra_fields.get("sick_end_date")
        parts = []
        if vac_start and vac_end:
            parts.append(f"Отпуск: {_format_date(vac_start)} — {_format_date(vac_end)}")
        if sick_start and sick_end:
            parts.append(f"Больничный: {_format_date(sick_start)} — {_format_date(sick_end)}")
        return ", ".join(parts)

    return ""


@router.get("/registry")
async def get_orders_registry(
    letter: str = Query(..., max_length=1),
    year: int = Query(..., ge=2000),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Return all orders with the given letter for the specified year."""
    from sqlalchemy import select
    from app.models.employee import Employee
    from app.models.vacation_period import VacationPeriod

    # Fetch all employees
    employees_result = await db.execute(select(Employee))
    employees_map = {emp.id: emp for emp in employees_result.scalars().all()}

    # Fetch all open vacation periods (remaining_days > 0) grouped by employee_id
    periods_result = await db.execute(
        select(VacationPeriod).where(VacationPeriod.remaining_days > 0)
    )
    # For each employee, keep only the most recent open period (latest period_start)
    employee_period_map: dict[int, VacationPeriod] = {}
    for period in periods_result.scalars().all():
        existing = employee_period_map.get(period.employee_id)
        if not existing or period.period_start > existing.period_start:
            employee_period_map[period.employee_id] = period

    result = await order_service.get_all(
        db,
        page=1,
        per_page=10000,
        year=year,
        order_letter=letter,
    )
    items = result["items"]
    total = result["total"]
    registry_items = []
    for o in items:
        order_type_code = o.get("order_type_code", "")
        extra_fields = o.get("extra_fields", {})
        order_period = _format_order_period(order_type_code, extra_fields)

        # For group orders, each employee is a separate row
        if o.get("is_group") and o.get("group_employees"):
            for emp in o["group_employees"]:
                employee_id = emp.get("employee_id")
                work_period = _get_work_period_from_vacation(employee_id, employee_period_map)
                # For group orders, use employee-specific vacation dates
                emp_period = ""
                emp_vac_start = emp.get("vacation_start")
                emp_vac_end = emp.get("vacation_end")
                if emp_vac_start and emp_vac_end:
                    emp_period = f"{_format_date(emp_vac_start)} — {_format_date(emp_vac_end)}"
                registry_items.append({
                    "order_id": o["id"],
                    "employee_name": emp["employee_full_name"],
                    "order_type_name": o["order_type_name"],
                    "order_number": o["order_number"],
                    "order_date": str(o["order_date"]),
                    "work_period": work_period,
                    "order_period": emp_period or order_period,
                })
        else:
            employee_name = o["employee_name"] or ""
            employee_id = o.get("employee_id")
            work_period = _get_work_period_from_vacation(employee_id, employee_period_map)
            registry_items.append({
                "order_id": o["id"],
                "employee_name": employee_name,
                "order_type_name": o["order_type_name"],
                "order_number": o["order_number"],
                "order_date": str(o["order_date"]),
                "work_period": work_period,
                "order_period": order_period,
            })

    return {
        "items": registry_items,
        "letter": letter,
        "year": year,
        "debug_total": total,
    }


def _get_work_period_from_vacation(employee_id, period_map: dict) -> str:
    """Get work period string from vacation period map for the given employee."""
    if not employee_id:
        return "—"
    period = period_map.get(employee_id)
    if not period:
        return "—"
    start = period.period_start.strftime("%d.%m.%Y") if period.period_start else "—"
    end = period.period_end.strftime("%d.%m.%Y") if period.period_end else "—"
    return f"{start} — {end}"


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


@router.get("/{order_id}/print-pdf")
async def print_order_pdf(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        raise HRMSException("OnlyOffice отключен", "onlyoffice_disabled", status_code=503)

    order = await order_service.get_by_id(db, order_id)
    if not order.file_path:
        raise HRMSException("Файл приказа не найден", "order_file_not_found", status_code=404)

    docx_path = storage_path(order.file_path, "ORDERS_PATH")
    if not docx_path.exists():
        raise HRMSException("Файл приказа отсутствует на диске", "order_file_missing", status_code=404)

    pdf_path = await order_print_service.get_or_create_pdf("order", order_id, docx_path)
    response = FileResponse(str(pdf_path), media_type=PDF_MEDIA_TYPE)
    response.headers["Content-Disposition"] = f'inline; filename="{pdf_path.name}"'
    return response


@router.put("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: int,
    data: OrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order = await order_service.update_order(db, order_id, data, current_user)
    return order_service._serialize_order(order)


@router.delete("/{order_id}")
async def delete_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await order_service.hard_delete_order(db, order_id)
    return {"message": "Приказ удален"}
