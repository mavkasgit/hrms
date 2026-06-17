from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.vacation import (
    VacationCreate,
    VacationUpdate,
    VacationResponse,
    VacationListResponse,
    VacationBalanceResponse,
    VacationRecallRequest,
    VacationRecallResponse,
    VacationExtensionRequest,
    VacationExtensionResponse,
    VacationPostponeRequest,
    VacationPostponeResponse,
)
from app.services.vacation_service import vacation_service
from app.repositories.vacation_repository import vacation_repository

router = APIRouter(prefix="/vacations", tags=["vacations"])


# --- New schemas for summary/history ---
class TagRef(BaseModel):
    id: int
    name: str
    color: Optional[str] = None


class EmployeeVacationSummary(BaseModel):
    id: int
    tab_number: Optional[int]
    name: str
    department: str
    department_id: Optional[int]
    department_color: Optional[str]
    department_icon: Optional[str]
    position: str
    hire_date: Optional[str]
    additional_vacation_days: Optional[int]
    total_used_days: int
    calculated_available: Optional[int]
    remaining_days: Optional[int]
    current_period_remaining: Optional[int]
    current_period_total: Optional[int]
    current_period_end: Optional[str]
    tags: list[TagRef] = []


class VacationHistoryItem(BaseModel):
    id: int
    order_id: Optional[int]
    start_date: str
    end_date: str
    days_count: int
    vacation_type: str
    order_number: Optional[str]
    comment: Optional[str]


class YearGroup(BaseModel):
    year: int
    used_days: int
    available_days: int
    vacations: list[VacationHistoryItem]


class EmployeeVacationHistory(BaseModel):
    employee_id: int
    employee_name: str
    hire_date: Optional[str]
    years: list[YearGroup]


class VacationDeletionPreview(BaseModel):
    vacation_id: int
    employee_name: str
    order_number: Optional[str]
    days_count: int
    start_date: str
    end_date: str
    has_transactions: bool
    transaction_count: int
    has_adjustments: bool
    adjustment_count: int
    has_recall_order: bool
    recall_order_number: Optional[str]
    has_postpone_order: bool
    postpone_order_number: Optional[str]
    has_extension_order: bool
    extension_order_number: Optional[str]
    warnings: list[str] = []


from app.api.deps import get_current_user as _get_current_user_stub


@router.get("/employees-summary", response_model=list[EmployeeVacationSummary])
async def get_employees_summary(
    q: Optional[str] = Query(None),
    archive_filter: str = Query("active", alias="filter"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_service.get_employees_summary(db, q=q, archive_filter=archive_filter)


@router.get("/employees/{employee_id}/history", response_model=EmployeeVacationHistory)
async def get_employee_vacation_history(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_service.get_employee_vacation_history(db, employee_id)


@router.get("", response_model=VacationListResponse)
async def get_vacations(
    employee_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    vacation_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    items, total = await vacation_repository.get_all(
        db, employee_id=employee_id, year=year, vacation_type=vacation_type, q=q,
        page=page, per_page=per_page,
    )
    return {
        "items": [
            {
                "id": v.id,
                "employee_id": v.employee_id,
                "employee_name": v.employee.name if v.employee else None,
                "start_date": str(v.start_date),
                "end_date": str(v.end_date),
                "vacation_type": v.vacation_type,
                "days_count": v.days_count,
                "comment": v.comment,
                "created_at": str(v.created_at) if v.created_at else None,
                "order_id": v.order_id,
                "order_number": v.order.order_number if getattr(v, "order", None) else None,
            }
            for v in items
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("", response_model=VacationResponse, status_code=201)
async def create_vacation(
    data: VacationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        result = await vacation_service.create_vacation(
            db, data.model_dump(), current_user
        )
        return result
    except Exception as e:
        import logging
        logging.error(f"[create_vacation] ERROR: {e}", exc_info=True)
        raise


@router.get("/balance", response_model=VacationBalanceResponse)
async def get_vacation_balance(
    employee_id: int = Query(..., gt=0),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_service.get_vacation_balance(db, employee_id, year)


@router.get("/active-all", response_model=list[VacationResponse])
async def get_all_active_vacations(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Возвращает все действующие на сегодня отпуски всех сотрудников."""
    items = await vacation_repository.get_active_all(db)
    return [
        {
            "id": v.id,
            "employee_id": v.employee_id,
            "employee_name": v.employee.name if v.employee else None,
            "start_date": v.start_date,
            "end_date": v.end_date,
            "vacation_type": v.vacation_type,
            "days_count": v.days_count,
            "comment": v.comment,
            "created_at": str(v.created_at) if v.created_at else None,
            "order_id": v.order_id,
            "order_number": v.order.order_number if getattr(v, "order", None) else None,
        }
        for v in items
    ]


@router.get("/{vacation_id}", response_model=VacationResponse)
async def get_vacation(
    vacation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    from app.core.exceptions import VacationNotFoundError
    vacation = await vacation_repository.get_by_id(db, vacation_id)
    if not vacation:
        raise VacationNotFoundError(vacation_id)
    return {
        "id": vacation.id,
        "employee_id": vacation.employee_id,
        "employee_name": vacation.employee.name if vacation.employee else None,
        "start_date": str(vacation.start_date),
        "end_date": str(vacation.end_date),
        "vacation_type": vacation.vacation_type,
        "days_count": vacation.days_count,
        "comment": vacation.comment,
        "created_at": str(vacation.created_at) if vacation.created_at else None,
        "order_id": vacation.order_id,
        "order_number": vacation.order.order_number if getattr(vacation, "order", None) else None,
    }


@router.get("/{vacation_id}/deletion-preview", response_model=VacationDeletionPreview)
async def get_vacation_deletion_preview(
    vacation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    from app.core.exceptions import VacationNotFoundError
    from sqlalchemy import select, func
    from app.models.vacation_period_transaction import VacationPeriodTransaction
    from app.models.vacation_adjustment import VacationAdjustment

    vacation = await vacation_repository.get_by_id(db, vacation_id)
    if not vacation:
        raise VacationNotFoundError(vacation_id)

    # Считаем транзакции
    tx_result = await db.execute(
        select(func.count(VacationPeriodTransaction.id)).where(
            VacationPeriodTransaction.vacation_id == vacation_id
        )
    )
    tx_count = tx_result.scalar() or 0

    # Считаем adjustments
    adj_result = await db.execute(
        select(func.count(VacationAdjustment.id)).where(
            VacationAdjustment.vacation_id == vacation_id
        )
    )
    adj_count = adj_result.scalar() or 0

    # Проверяем recall order
    has_recall = vacation.is_recalled and vacation.recall_order_id is not None
    recall_order_number = None
    if has_recall and getattr(vacation, "recall_order", None):
        recall_order_number = vacation.recall_order.order_number

    # Проверяем postpone order
    has_postpone = vacation.is_postponed and vacation.postpone_order_id is not None
    postpone_order_number = None
    if has_postpone and getattr(vacation, "postpone_order", None):
        postpone_order_number = vacation.postpone_order.order_number

    # Проверяем extension order
    has_extension = vacation.is_extended and vacation.extension_order_id is not None
    extension_order_number = None
    if has_extension and getattr(vacation, "extension_order", None):
        extension_order_number = vacation.extension_order.order_number

    warnings: list[str] = []
    if tx_count > 0:
        warnings.append(f"Будет удалено {tx_count} транзакций в периодах отпусков")
    if adj_count > 0:
        warnings.append(f"Будет удалено {adj_count} корректировок отпуска")
    if has_recall:
        warnings.append(f"Отпуск был отозван по приказу {recall_order_number} — отзыв будет аннулирован")
    if has_postpone:
        warnings.append(f"Отпуск перенесён по приказу {postpone_order_number} — перенос будет аннулирован")
    if has_extension:
        warnings.append(f"Отпуск продлён по приказу {extension_order_number} — продление будет аннулировано")
    if vacation.order_id:
        order_number = vacation.order.order_number if getattr(vacation, "order", None) else None
        if order_number:
            warnings.append(f"Будет удалён приказ {order_number}, связанный с отпуском")
        else:
            warnings.append("Будет удалён приказ, связанный с отпуском")

    return VacationDeletionPreview(
        vacation_id=vacation.id,
        employee_name=vacation.employee.name if vacation.employee else "Неизвестно",
        order_number=vacation.order.order_number if getattr(vacation, "order", None) else None,
        days_count=vacation.days_count,
        start_date=str(vacation.start_date),
        end_date=str(vacation.end_date),
        has_transactions=tx_count > 0,
        transaction_count=tx_count,
        has_adjustments=adj_count > 0,
        adjustment_count=adj_count,
        has_recall_order=has_recall,
        recall_order_number=recall_order_number,
        has_postpone_order=has_postpone,
        postpone_order_number=postpone_order_number,
        has_extension_order=has_extension,
        extension_order_number=extension_order_number,
        warnings=warnings,
    )


@router.put("/{vacation_id}", response_model=VacationResponse)
async def update_vacation(
    vacation_id: int,
    data: VacationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await vacation_service.update_vacation(
        db, vacation_id, data.model_dump(exclude_unset=True), current_user
    )
    return result


@router.delete("/{vacation_id}")
async def delete_vacation(
    vacation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await vacation_service.delete_vacation(db, vacation_id, current_user)
    return {"message": "Отпуск удалён"}


@router.get("/employees/{employee_id}/active", response_model=list[VacationResponse])
async def get_active_vacations(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Возвращает активные отпуски сотрудника."""
    items, _ = await vacation_repository.get_all(
        db, employee_id=employee_id, page=1, per_page=1000
    )
    return [
        {
            "id": v.id,
            "employee_id": v.employee_id,
            "employee_name": v.employee.name if v.employee else None,
            "start_date": v.start_date,
            "end_date": v.end_date,
            "vacation_type": v.vacation_type,
            "days_count": v.days_count,
            "comment": v.comment,
            "created_at": str(v.created_at) if v.created_at else None,
            "order_id": v.order_id,
            "order_number": v.order.order_number if getattr(v, "order", None) else None,
        }
        for v in active
    ]


@router.post("/{vacation_id}/recall", response_model=VacationRecallResponse)
async def recall_vacation(
    vacation_id: int,
    data: VacationRecallRequest,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await vacation_service.recall_vacation(
        db, vacation_id, data.model_dump(), current_user
    )
    return result


@router.post("/{vacation_id}/extend", response_model=VacationExtensionResponse)
async def extend_vacation(
    vacation_id: int,
    data: VacationExtensionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await vacation_service.extend_vacation(
        db, vacation_id, data.model_dump(), current_user
    )
    return result


@router.post("/{vacation_id}/postpone", response_model=VacationPostponeResponse)
async def postpone_vacation(
    vacation_id: int,
    data: VacationPostponeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await vacation_service.postpone_vacation(
        db, vacation_id, data.model_dump(), current_user
    )
    return result
