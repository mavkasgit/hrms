from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.employee import (
    EmployeeArchive,
    EmployeeCreate,
    EmployeeListResponse,
    EmployeeResponse,
    EmployeeUpdate,
    EmployeeAuditLogResponse,
    EmployeeWarningsResponse,
)
from app.services.employee_service import employee_service

router = APIRouter(prefix="/employees", tags=["employees"])


def _get_current_user_stub() -> str:
    return "admin"


@router.get("", response_model=EmployeeListResponse)
async def list_employees(
    q: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    status: Optional[str] = Query("active", pattern="^(active|archived|all|deleted)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=1000),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if q:
        employees = await employee_service.search_employees(db, q)
        total = len(employees)
        start = (page - 1) * per_page
        items = employees[start:start + per_page]
        total_pages = max(1, (total + per_page - 1) // per_page)
        return {
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    result = await employee_service.get_all_employees(
        db,
        department=department,
        gender=gender,
        status=status,
        page=page,
        per_page=per_page,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return result


@router.get("/search")
async def search_employees(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    employees = await employee_service.search_employees(db, q)
    return {
        "items": [EmployeeResponse.model_validate(e) for e in employees],
        "total": len(employees),
    }


@router.get("/departments")
async def get_departments(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    departments = await employee_service.get_departments(db)
    return {"departments": departments}


@router.get("/by-tab/{tab_number}", response_model=EmployeeResponse)
async def get_employee_by_tab(
    tab_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    employee = await employee_service.get_by_tab_number(db, tab_number)
    return employee


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    employee = await employee_service.get_by_id(db, employee_id)
    return employee


@router.post("", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    data: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    employee = await employee_service.create_employee(db, data, current_user)
    return employee


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int,
    data: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    employee = await employee_service.update_employee(db, employee_id, data, current_user)
    return employee


@router.post("/{employee_id}/archive")
async def archive_employee(
    employee_id: int,
    body: Optional[EmployeeArchive] = None,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    reason = body.termination_reason if body else None
    employee, warnings = await employee_service.archive_employee(db, employee_id, current_user, reason)
    response = EmployeeResponse.model_validate(employee)
    result = response.model_dump()
    result["warnings"] = warnings
    return result


@router.post("/{employee_id}/restore", response_model=EmployeeResponse)
async def restore_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    employee = await employee_service.restore_employee(db, employee_id, current_user)
    return employee


@router.get("/{employee_id}/audit-log", response_model=list[EmployeeAuditLogResponse])
async def get_employee_audit_log(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    log = await employee_service.get_audit_log(db, employee_id)
    return log


@router.get("/{employee_id}/warnings", response_model=EmployeeWarningsResponse)
async def get_archive_warnings(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    warnings = await employee_service.get_archive_warnings(db, employee_id)
    return {"warnings": warnings}


@router.delete("/{employee_id}", status_code=204)
async def delete_employee(
    employee_id: int,
    hard: bool = Query(False),
    confirm: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if hard:
        if not confirm:
            from app.core.exceptions import HRMSException
            raise HRMSException("Требуется подтверждение: ?confirm=true", "confirmation_required", status_code=400)
        await employee_service.hard_delete_employee(db, employee_id, current_user)
    else:
        await employee_service.soft_delete_employee(db, employee_id, current_user)
