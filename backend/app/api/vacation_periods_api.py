from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.employee import Employee
from app.schemas.vacation_period import VacationPeriodResponse, VacationPeriodBalance, VacationPeriodAdjust
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
    # Получаем сотрудника для contract_start
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


@router.post("/{period_id}/adjust", response_model=VacationPeriodBalance)
async def adjust_period_additional_days(
    period_id: int,
    data: VacationPeriodAdjust,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Обновить additional_days для периода."""
    return await vacation_period_service.adjust_additional_days(db, period_id, data.additional_days)


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
