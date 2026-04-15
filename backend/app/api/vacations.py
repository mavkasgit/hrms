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
)
from app.services.vacation_service import vacation_service
from app.repositories.vacation_repository import vacation_repository

router = APIRouter(prefix="/vacations", tags=["vacations"])


# --- New schemas for summary/history ---
class EmployeeVacationSummary(BaseModel):
    id: int
    tab_number: Optional[int]
    name: str
    department: str
    position: str
    contract_start: Optional[str]
    additional_vacation_days: Optional[int]
    total_used_days: int
    calculated_available: Optional[int]
    remaining_days: Optional[int]


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
    contract_start: Optional[str]
    years: list[YearGroup]


def _get_current_user_stub() -> str:
    return "admin"


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
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    items, total = await vacation_repository.get_all(
        db, employee_id=employee_id, year=year, vacation_type=vacation_type,
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
    }


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


@router.put("/{vacation_id}/cancel")
async def cancel_vacation(
    vacation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await vacation_service.cancel_vacation(db, vacation_id, current_user)
    return {"message": "Отпуск отменён"}
