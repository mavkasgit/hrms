from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.contract_history import ContractHistoryListResponse, ContractHistoryResponse
from app.services.contract_history_service import contract_history_service

router = APIRouter(tags=["contract-history"])


from app.api.deps import get_current_user as _get_current_user_stub


@router.get("/employees/{employee_id}/contracts", response_model=ContractHistoryListResponse)
async def get_employee_contracts(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Get all contract history records for an employee."""
    records = await contract_history_service.get_by_employee(db, employee_id)
    items = []
    for r in records:
        order = r.order
        emp = r.employee
        items.append(ContractHistoryResponse(
            id=r.id,
            employee_id=r.employee_id,
            employee_name=emp.name if emp else None,
            employee_position=emp.position.name if emp and emp.position else None,
            employee_department=emp.department.name if emp and emp.department else None,
            order_id=r.order_id,
            contract_number=r.contract_number,
            contract_start=r.contract_start,
            contract_end=r.contract_end,
            order_type_code=r.order_type_code,
            order_number=order.order_number if order else None,
            order_date=order.order_date if order else None,
            created_at=r.created_at,
        ))
    return {"items": items, "total": len(items)}


@router.get("/orders/{order_id}/contracts")
async def get_order_contracts(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Get contract history records linked to a specific order."""
    records = await contract_history_service.get_by_order(db, order_id)
    return [
        {
            "id": r.id,
            "employee_id": r.employee_id,
            "contract_number": r.contract_number,
            "contract_start": r.contract_start.isoformat() if r.contract_start else None,
            "contract_end": r.contract_end.isoformat() if r.contract_end else None,
            "order_type_code": r.order_type_code,
        }
        for r in records
    ]


@router.get("/contracts/years")
async def get_contract_years(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Get distinct years from contract_start dates."""
    from sqlalchemy import func, select
    from app.models.contract_history import ContractHistory

    result = await db.execute(
        select(func.extract("year", ContractHistory.contract_start))
        .where(ContractHistory.contract_start.isnot(None))
        .distinct()
        .order_by(func.extract("year", ContractHistory.contract_start).desc())
    )
    years = [int(row[0]) for row in result.all() if row[0] is not None]
    return {"years": years}


@router.get("/contracts/registry", response_model=ContractHistoryListResponse)
async def get_contract_registry(
    page: Optional[int] = Query(1, ge=1),
    per_page: Optional[int] = Query(None, ge=1),
    employee_id: Optional[int] = Query(None),
    order_type_code: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Get all contract history records with filtering and pagination."""
    from sqlalchemy import func, select
    from sqlalchemy.orm import selectinload
    from app.models.contract_history import ContractHistory
    from app.models.employee import Employee

    query = (
        select(ContractHistory)
        .options(
            selectinload(ContractHistory.employee)
            .selectinload(Employee.department),
            selectinload(ContractHistory.employee)
            .selectinload(Employee.position),
            selectinload(ContractHistory.order),
        )
    )

    if employee_id:
        query = query.where(ContractHistory.employee_id == employee_id)
    if order_type_code:
        query = query.where(ContractHistory.order_type_code == order_type_code)
    if year:
        query = query.where(func.extract("year", ContractHistory.contract_start) == year)

    query = query.order_by(ContractHistory.contract_start.desc())

    # Total count
    count_query = select(func.count()).select_from(ContractHistory)
    if employee_id:
        count_query = count_query.where(ContractHistory.employee_id == employee_id)
    if order_type_code:
        count_query = count_query.where(ContractHistory.order_type_code == order_type_code)
    if year:
        count_query = count_query.where(func.extract("year", ContractHistory.contract_start) == year)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginated results (only if per_page is provided)
    if per_page is not None:
        offset = (page - 1) * per_page
        query = query.offset(offset).limit(per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
    else:
        total_pages = 1

    result = await db.execute(query)
    records = list(result.scalars().all())

    items = []
    for r in records:
        order = r.order
        emp = r.employee
        items.append(ContractHistoryResponse(
            id=r.id,
            employee_id=r.employee_id,
            employee_name=emp.name if emp else None,
            employee_position=emp.position.name if emp and emp.position else None,
            employee_department=emp.department.name if emp and emp.department else None,
            order_id=r.order_id,
            contract_number=r.contract_number,
            contract_start=r.contract_start,
            contract_end=r.contract_end,
            order_type_code=r.order_type_code,
            order_number=order.order_number if order else None,
            order_date=order.order_date if order else None,
            created_at=r.created_at,
        ))

    response: dict = {
        "items": items,
        "total": total,
    }
    if per_page is not None:
        response["page"] = page
        response["per_page"] = per_page
        response["total_pages"] = total_pages
    return response

