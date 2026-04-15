from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.employee import Employee
from app.schemas.vacation_period import VacationPeriodResponse, VacationPeriodBalance, VacationPeriodAdjust, VacationPeriodUsedDays, VacationPeriodBreakdown
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
    """Список периодов сотрудника с балансом каждого. Авто-создание недостающих."""
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if emp and emp.contract_start:
        await vacation_period_service.ensure_periods_for_employee(
            db, employee_id, emp.contract_start, emp.additional_vacation_days
        )
    return await vacation_period_service.get_employee_periods(db, employee_id)


@router.get("/{period_id}/balance", response_model=VacationPeriodBalance)
async def get_period_balance(
    period_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Баланс конкретного периода."""
    return await vacation_period_service.get_balance(db, period_id)


@router.get("/{period_id}/breakdown")
async def get_period_breakdown(
    period_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Детализация списанных дней по периоду."""
    from app.schemas.vacation_period import VacationPeriodBreakdown
    from app.models.vacation_period import VacationPeriod
    from sqlalchemy import select
    
    result = await db.execute(select(VacationPeriod).where(VacationPeriod.id == period_id))
    period = result.scalar_one_or_none()
    
    if not period:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Период не найден")
    
    order_ids_list = []
    if period.order_ids:
        order_ids_list = [int(x) for x in period.order_ids.split(',') if x]
    
    auto_details = []
    for oid in order_ids_list:
        from app.models.vacation import Vacation
        vac_result = await db.execute(
            select(Vacation).where(Vacation.order_id == oid, Vacation.is_deleted == False)
        )
        vac = vac_result.scalar_one_or_none()
        if vac:
            auto_details.append({"order_id": oid, "days": vac.days_count})
    
    return VacationPeriodBreakdown(
        auto=auto_details,
        manual_days=period.used_days_manual or 0
    )


@router.post("/{period_id}/adjust", response_model=VacationPeriodBalance)
async def adjust_period_additional_days(
    period_id: int,
    data: VacationPeriodAdjust,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Обновить additional_days для периода."""
    return await vacation_period_service.adjust_additional_days(db, period_id, data.additional_days)


@router.post("/{period_id}/set-used-days", response_model=VacationPeriodBalance)
async def set_period_used_days(
    period_id: int,
    data: VacationPeriodUsedDays,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Установить used_days напрямую (для overclose сценария)."""
    from app.repositories.vacation_period_repository import VacationPeriodRepository
    repo = VacationPeriodRepository()
    period = await repo.get_by_id(db, period_id)
    if not period:
        from fastapi import HTTPException
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
        remaining_days=total - period.used_days,
    )


@router.post("/{period_id}/close", response_model=VacationPeriodBalance)
async def close_period(
    period_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Закрыть период полностью - списать все оставшиеся дни."""
    return await vacation_period_service.close_period(db, period_id)


@router.post("/{period_id}/partial-close", response_model=VacationPeriodBalance)
async def partial_close_period(
    period_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Частично закрыть период - оставить указанное количество дней."""
    remaining_days = data.get("remaining_days", 0)
    return await vacation_period_service.partial_close_period(db, period_id, remaining_days)
