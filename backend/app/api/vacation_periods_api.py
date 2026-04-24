from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.employee import Employee
from app.models.vacation import Vacation
from app.models.vacation_period import VacationPeriod
from app.schemas.vacation_period import (
    VacationPeriodAdjust,
    VacationPeriodBalance,
    VacationPeriodBreakdown,
    VacationPeriodUsedDays,
)
from app.services.vacation_period_service import vacation_period_service

router = APIRouter(prefix="/vacation-periods", tags=["vacation-periods"])


def _get_current_user_stub() -> str:
    return "admin"


@router.get("", response_model=list[VacationPeriodBalance])
async def list_vacation_periods(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = result.scalar_one_or_none()
    if employee and employee.hire_date:
        await vacation_period_service.ensure_periods_for_employee(
            db,
            employee_id,
            employee.hire_date,
            employee.additional_vacation_days,
        )
    return await vacation_period_service.get_employee_periods(db, employee_id)


@router.get("/{period_id}/balance", response_model=VacationPeriodBalance)
async def get_period_balance(
    period_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_period_service.get_balance(db, period_id)


@router.get("/{period_id}/breakdown", response_model=VacationPeriodBreakdown)
async def get_period_breakdown(
    period_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await db.execute(select(VacationPeriod).where(VacationPeriod.id == period_id))
    period = result.scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Период не найден")

    vac_result = await db.execute(
        select(Vacation).where(
            Vacation.employee_id == period.employee_id,
            Vacation.start_date >= period.period_start,
            Vacation.start_date <= period.period_end,
            Vacation.is_deleted == False,
        )
    )

    return VacationPeriodBreakdown(
        auto=[
            {
                "vacation_id": vacation.id,
                "start_date": str(vacation.start_date),
                "end_date": str(vacation.end_date),
                "days": vacation.days_count,
                "vacation_type": vacation.vacation_type,
                "comment": vacation.comment,
            }
            for vacation in vac_result.scalars().all()
        ],
        manual_days=period.used_days_manual or 0,
    )


@router.post("/{period_id}/adjust", response_model=VacationPeriodBalance)
async def adjust_period_additional_days(
    period_id: int,
    data: VacationPeriodAdjust,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_period_service.adjust_additional_days(db, period_id, data.additional_days)


@router.post("/{period_id}/set-used-days", response_model=VacationPeriodBalance)
async def set_period_used_days(
    period_id: int,
    data: VacationPeriodUsedDays,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    from app.repositories.vacation_period_repository import VacationPeriodRepository

    repo = VacationPeriodRepository()
    period = await repo.get_by_id(db, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Период отпусков не найден")

    period.used_days = data.used_days
    await db.flush()
    await db.commit()
    await db.refresh(period)

    total = period.main_days + period.additional_days
    return VacationPeriodBalance(
        period_id=period.id,
        year_number=period.year_number,
        period_start=period.period_start,
        period_end=period.period_end,
        main_days=period.main_days,
        additional_days=period.additional_days,
        total_days=total,
        used_days=period.used_days,
        used_days_auto=period.used_days_auto or 0,
        used_days_manual=period.used_days_manual or 0,
        order_ids=period.order_ids,
        order_numbers=period.order_numbers,
        remaining_days=total - period.used_days,
        vacations=[],
    )


@router.post("/{period_id}/close", response_model=VacationPeriodBalance)
async def close_period(
    period_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_period_service.close_period(db, period_id)


@router.post("/{period_id}/partial-close", response_model=VacationPeriodBalance)
async def partial_close_period(
    period_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    remaining_days = data.get("remaining_days", 0)
    return await vacation_period_service.partial_close_period(db, period_id, remaining_days)
