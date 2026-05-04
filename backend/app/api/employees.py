from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.tag import Tag, EmployeeTag
from app.models.hire_date_adjustment import HireDateAdjustment
from app.models.order import Order
from app.schemas.department_graph import TagRef
from app.schemas.employee import (
    EmployeeArchive,
    EmployeeCreate,
    EmployeeListResponse,
    EmployeeListWithTagsResponse,
    EmployeeResponse,
    EmployeeWithTagsResponse,
    EmployeeUpdate,
    EmployeeAuditLogResponse,
    EmployeeWarningsResponse,
)
from app.schemas.vacation_period import VacationPeriodBalance
from app.schemas.hire_date_adjustment import HireDateAdjustmentCreate, HireDateAdjustmentResponse
from app.services.employee_service import employee_service
from app.services.vacation_period_service import vacation_period_service
from app.services.audit_log_service import read_audit_logs
from app.repositories.hire_date_adjustment_repository import HireDateAdjustmentRepository
from pydantic import BaseModel
from datetime import date
from typing import Optional


class HireOrderResponse(BaseModel):
    id: int
    order_number: str
    order_date: date
    file_path: str | None

    class Config:
        from_attributes = True

router = APIRouter(prefix="/employees", tags=["employees"])


def _get_current_user_stub() -> str:
    return "admin"


async def _load_employee_tags(db: AsyncSession, employee_ids: list[int]) -> dict[int, list[TagRef]]:
    """Загружает теги для списка сотрудников."""
    if not employee_ids:
        return {}
    result = await db.execute(
        select(EmployeeTag, Tag)
        .join(Tag, EmployeeTag.tag_id == Tag.id)
        .where(EmployeeTag.employee_id.in_(employee_ids))
    )
    rows = result.all()
    tags_map: dict[int, list[TagRef]] = {}
    for et, tag in rows:
        tags_map.setdefault(et.employee_id, []).append(
            TagRef(id=tag.id, name=tag.name, color=tag.color)
        )
    return tags_map


def _build_employee_with_tags(employee, tags_map: dict[int, list[TagRef]]) -> EmployeeWithTagsResponse:
    base = EmployeeResponse.model_validate(employee)
    data = base.model_dump()
    data["tags"] = [t.model_dump() for t in tags_map.get(employee.id, [])]
    return EmployeeWithTagsResponse(**data)


@router.get("", response_model=EmployeeListWithTagsResponse)
async def list_employees(
    q: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
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
        emp_ids = [e.id for e in items]
        tags_map = await _load_employee_tags(db, emp_ids)
        return {
            "items": [_build_employee_with_tags(e, tags_map) for e in items],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    result = await employee_service.get_all_employees(
        db,
        department_id=department_id,
        gender=gender,
        status=status,
        page=page,
        per_page=per_page,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    emp_ids = [e.id for e in result["items"]]
    tags_map = await _load_employee_tags(db, emp_ids)
    return {
        **result,
        "items": [_build_employee_with_tags(e, tags_map) for e in result["items"]],
    }


@router.get("/search", response_model=EmployeeListWithTagsResponse)
async def search_employees(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    employees = await employee_service.search_employees(db, q)
    emp_ids = [e.id for e in employees]
    tags_map = await _load_employee_tags(db, emp_ids)
    return {
        "items": [_build_employee_with_tags(e, tags_map) for e in employees],
        "total": len(employees),
        "page": 1,
        "per_page": len(employees),
        "total_pages": 1,
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
    # После создания перезагружаем с relations для сериализации
    from sqlalchemy.orm import joinedload
    from sqlalchemy import select
    from app.models.employee import Employee
    result = await db.execute(
        select(Employee)
        .options(joinedload(Employee.department), joinedload(Employee.position))
        .where(Employee.id == employee.id)
    )
    return result.scalar_one()


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int,
    data: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    employee, periods_need_reset = await employee_service.update_employee(db, employee_id, data, current_user)
    response = EmployeeResponse.model_validate(employee)
    result = response.model_dump()
    if periods_need_reset:
        result["periods_need_reset"] = True
    return result


@router.post("/{employee_id}/reset-periods", response_model=EmployeeResponse)
async def reset_employee_periods(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    # Полностью пересоздаём периоды и перераспределяем дни отпусков
    await vacation_period_service.recalculate_periods(db, employee_id)
    # Перезагружаем employee с relations для сериализации
    from sqlalchemy.orm import joinedload
    from sqlalchemy import select
    from app.models.employee import Employee
    result = await db.execute(
        select(Employee)
        .options(joinedload(Employee.department), joinedload(Employee.position))
        .where(Employee.id == employee_id)
    )
    return result.scalar_one()


@router.post("/{employee_id}/recalculate-periods", response_model=list[VacationPeriodBalance])
async def recalculate_employee_periods(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_period_service.recalculate_periods(db, employee_id)


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


@router.get("/audit-log/all")
async def get_all_audit_log(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None),
    employee_name: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: str = Depends(_get_current_user_stub),
):
    """Получить общий журнал действий со всеми сотрудниками."""
    result = read_audit_logs(
        limit=limit, offset=offset, action=action,
        employee_name=employee_name, date_from=date_from, date_to=date_to
    )
    return result


@router.get("/{employee_id}/periods-status")
async def get_employee_periods_status(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Проверить, соответствуют ли периоды отпусков текущему hire_date."""
    employee = await employee_service.get_by_id(db, employee_id)
    mismatch = False
    if employee and employee.hire_date:
        mismatch = await vacation_period_service.check_periods_mismatch(
            db, employee_id, employee.hire_date
        )
    return {"mismatch": mismatch}


@router.get("/{employee_id}/warnings", response_model=EmployeeWarningsResponse)
async def get_archive_warnings(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    warnings = await employee_service.get_archive_warnings(db, employee_id)
    return {"warnings": warnings}


@router.post(
    "/{employee_id}/hire-date-adjustments",
    response_model=HireDateAdjustmentResponse,
    status_code=201,
)
async def create_hire_date_adjustment(
    employee_id: int,
    data: HireDateAdjustmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Создать запись корректировки даты начала периодов."""
    employee = await employee_service.get_by_id(db, employee_id)
    if not employee or not employee.hire_date:
        raise HTTPException(status_code=400, detail="У сотрудника не указана дата приёма")

    adjustment_repo = HireDateAdjustmentRepository()
    adjustment = await adjustment_repo.create(
        db,
        {
            "employee_id": employee_id,
            "adjustment_date": data.adjustment_date,
            "reason": data.reason,
            "created_by": current_user,
        },
    )

    # Пересоздаём периоды от новой даты, сохраняя старые
    await vacation_period_service.ensure_periods_for_employee(
        db,
        employee_id,
        employee.hire_date,
        employee.additional_vacation_days or 0,
    )
    await db.commit()
    await db.refresh(adjustment)

    return adjustment


@router.get(
    "/{employee_id}/hire-date-adjustments",
    response_model=list[HireDateAdjustmentResponse],
)
async def list_hire_date_adjustments(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Получить историю всех корректировок сотрудника."""
    adjustment_repo = HireDateAdjustmentRepository()
    adjustments = await adjustment_repo.get_by_employee(db, employee_id)
    return [HireDateAdjustmentResponse.model_validate(a) for a in adjustments]


@router.delete(
    "/{employee_id}/hire-date-adjustments/{adjustment_id}",
    status_code=204,
)
async def delete_hire_date_adjustment(
    employee_id: int,
    adjustment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Удалить запись корректировки и пересоздать периоды."""
    result = await db.execute(
        select(HireDateAdjustment).where(
            HireDateAdjustment.id == adjustment_id,
            HireDateAdjustment.employee_id == employee_id,
        )
    )
    adjustment = result.scalar_one_or_none()
    if not adjustment:
        raise HTTPException(status_code=404, detail="Корректировка не найдена")

    await db.delete(adjustment)

    # Пересоздаём периоды без этой корректировки
    employee = await employee_service.get_by_id(db, employee_id)
    if employee and employee.hire_date:
        await vacation_period_service.ensure_periods_for_employee(
            db,
            employee_id,
            employee.hire_date,
            employee.additional_vacation_days or 0,
        )
    await db.commit()


@router.get("/{employee_id}/hire-order", response_model=Optional[HireOrderResponse])
async def get_hire_order(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Получить приказ приёма сотрудника (тип order_type.code = 'hire')."""
    result = await db.execute(
        select(Order)
        .join(Order.order_type)
        .where(
            Order.employee_id == employee_id,
            Order.is_deleted == False,
            Order.is_cancelled == False,
            Order.order_type.has(code="hire"),
        )
        .order_by(Order.order_date.asc())
        .limit(1)
    )
    order = result.scalar_one_or_none()
    return order


@router.delete("/{employee_id}", status_code=204)
async def delete_employee(
    employee_id: int,
    hard: bool = Query(False),
    confirm: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    print(f"[DELETE] employee_id={employee_id}, hard={hard}, confirm={confirm}")
    if hard:
        if not confirm:
            from app.core.exceptions import HRMSException
            raise HRMSException("Требуется подтверждение: ?confirm=true", "confirmation_required", status_code=400)
        await employee_service.hard_delete_employee(db, employee_id, current_user)
    else:
        await employee_service.soft_delete_employee(db, employee_id, current_user)
    await db.commit()
