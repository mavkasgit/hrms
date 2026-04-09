from datetime import date
from typing import Optional

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vacation_period import VacationPeriod
from app.models.vacation import Vacation


class VacationPeriodRepository:
    async def create(self, db: AsyncSession, data: dict) -> VacationPeriod:
        period = VacationPeriod(**data)
        db.add(period)
        await db.flush()
        await db.refresh(period)
        return period

    async def get_by_id(self, db: AsyncSession, period_id: int) -> Optional[VacationPeriod]:
        result = await db.execute(
            select(VacationPeriod).where(VacationPeriod.id == period_id)
        )
        return result.scalar_one_or_none()

    async def get_by_employee(self, db: AsyncSession, employee_id: int) -> list[VacationPeriod]:
        result = await db.execute(
            select(VacationPeriod)
            .where(VacationPeriod.employee_id == employee_id)
            .order_by(VacationPeriod.year_number)
        )
        return list(result.scalars().all())

    async def get_current_period(self, db: AsyncSession, employee_id: int, today: Optional[date] = None) -> Optional[VacationPeriod]:
        if today is None:
            today = date.today()
        result = await db.execute(
            select(VacationPeriod).where(
                and_(
                    VacationPeriod.employee_id == employee_id,
                    VacationPeriod.period_start <= today,
                    VacationPeriod.period_end >= today,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_period_for_date(self, db: AsyncSession, employee_id: int, period_start: date) -> Optional[VacationPeriod]:
        result = await db.execute(
            select(VacationPeriod).where(
                and_(
                    VacationPeriod.employee_id == employee_id,
                    VacationPeriod.period_start == period_start,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_used_days(self, db: AsyncSession, period_id: int, today: Optional[date] = None) -> int:
        """Считаем использованные дни из таблицы vacations.
        Для текущего периода — только отпуска до сегодняшней даты.
        """
        period = await self.get_by_id(db, period_id)
        if not period:
            return 0

        # Если период в прошлом — считаем все отпуска за период
        # Если период активный (сегодня внутри) — считаем только до сегодня
        if today is None:
            today = date.today()

        if today > period.period_end:
            # Период закончился — считаем все отпуска
            end_date = period.period_end
        else:
            # Период активен — считаем только до сегодня
            end_date = today

        result = await db.execute(
            select(func.coalesce(func.sum(Vacation.days_count), 0)).where(
                and_(
                    Vacation.employee_id == period.employee_id,
                    Vacation.start_date >= period.period_start,
                    Vacation.start_date <= end_date,
                    Vacation.is_deleted == False,
                    Vacation.is_cancelled == False,
                )
            )
        )
        return int(result.scalar() or 0)

    async def update_additional_days(self, db: AsyncSession, period_id: int, additional_days: int) -> Optional[VacationPeriod]:
        period = await self.get_by_id(db, period_id)
        if not period:
            return None
        period.additional_days = additional_days
        await db.flush()
        await db.refresh(period)
        return period

    async def add_used_days(self, db: AsyncSession, period_id: int, days: int) -> None:
        """Добавить использованные дни к периоду."""
        period = await self.get_by_id(db, period_id)
        if not period:
            print(f"[add_used_days] ERROR: period {period_id} not found")
            return
        old_used = period.used_days or 0
        period.used_days = old_used + days
        print(f"[add_used_days] period_id={period_id}, old_used={old_used}, adding={days}, new_used={period.used_days}")
        await db.flush()
        await db.refresh(period)
        print(f"[add_used_days] flushed and refreshed, period.used_days={period.used_days}")
