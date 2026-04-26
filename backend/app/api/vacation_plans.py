from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.vacation_plan import VacationPlanResponse, VacationPlanCreate, VacationPlanUpdate, VacationPlanSummary
from app.services.vacation_plan_service import vacation_plan_service

router = APIRouter(prefix="/vacation-plans", tags=["vacation-plans"])


VacationPlanResponseOrNone = Optional[VacationPlanResponse]


def _get_current_user_stub() -> str:
    return "admin"


@router.get("", response_model=list[VacationPlanResponse])
async def list_vacation_plans(
    year: Optional[int] = Query(None),
    employee_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if year:
        if employee_id:
            plans = await vacation_plan_service._repo.get_by_employee_and_year(db, employee_id, year)
            return [VacationPlanResponse.model_validate(p) for p in plans]
        return await vacation_plan_service.get_by_year(db, year)
    return []


@router.get("/summary", response_model=list[VacationPlanSummary])
async def get_vacation_plans_summary(
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_plan_service.get_summary(db, year)


@router.post("", response_model=VacationPlanResponseOrNone, status_code=200)
async def create_or_update_vacation_plan(
    data: VacationPlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_plan_service.create_or_update(db, data.model_dump())


@router.put("/{plan_id}", response_model=VacationPlanResponse)
async def update_vacation_plan(
    plan_id: int,
    data: VacationPlanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    plan = await vacation_plan_service._repo.get_by_id(db, plan_id)
    if not plan:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Запись плана не найдена")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(plan, key, value)
    await db.flush()
    await db.refresh(plan)
    return VacationPlanResponse.model_validate(plan)


@router.delete("/{plan_id}", status_code=204)
async def delete_vacation_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await vacation_plan_service.delete(db, plan_id)
