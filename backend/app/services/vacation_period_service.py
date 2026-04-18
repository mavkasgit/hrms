from datetime import date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.vacation import Vacation
from app.models.vacation_period import VacationPeriod
from app.repositories.vacation_period_repository import VacationPeriodRepository
from app.schemas.vacation_period import VacationPeriodBalance

MAIN_VACATION_DAYS = 24


class VacationPeriodService:
    def __init__(self):
        self._repo = VacationPeriodRepository()

    async def create_period(
        self,
        db: AsyncSession,
        employee_id: int,
        contract_start: date,
        year_number: int,
        additional_days: int = 0,
    ) -> VacationPeriodBalance:
        from dateutil.relativedelta import relativedelta

        period_start = contract_start + relativedelta(months=12 * (year_number - 1))
        period_end = period_start + relativedelta(months=12) - relativedelta(days=1)

        period = await self._repo.create(
            db,
            {
                "employee_id": employee_id,
                "period_start": period_start,
                "period_end": period_end,
                "main_days": MAIN_VACATION_DAYS,
                "additional_days": additional_days,
                "year_number": year_number,
            },
        )

        return VacationPeriodBalance(
            period_id=period.id,
            year_number=period.year_number,
            period_start=period.period_start,
            period_end=period.period_end,
            main_days=period.main_days,
            additional_days=period.additional_days,
            total_days=period.main_days + period.additional_days,
            used_days=0,
            used_days_auto=0,
            used_days_manual=0,
            order_ids=period.order_ids,
            order_numbers=period.order_numbers,
            remaining_days=period.main_days + period.additional_days,
            vacations=[],
        )

    async def ensure_periods_for_employee(
        self,
        db: AsyncSession,
        employee_id: int,
        contract_start: date,
        additional_days: int = 0,
    ) -> None:
        from dateutil.relativedelta import relativedelta

        today = date.today()
        existing = await self._repo.get_by_employee(db, employee_id)
        last_year = max((p.year_number for p in existing), default=0)

        for period in existing:
            if period.additional_days != additional_days:
                await self._repo.update_additional_days(db, period.id, additional_days)

        rd = relativedelta(today, contract_start)
        years_passed = rd.years
        current_year_number = years_passed + 1 if rd.months > 0 or rd.days > 0 else years_passed

        for year_number in range(last_year + 1, current_year_number + 1):
            await self.create_period(db, employee_id, contract_start, year_number, additional_days)

    async def get_balance(self, db: AsyncSession, period_id: int) -> VacationPeriodBalance:
        period = await self._repo.get_by_id(db, period_id)
        if not period:
            raise HTTPException(status_code=404, detail="Период отпусков не найден")

        total = period.main_days + period.additional_days
        used_days = period.used_days or 0

        return VacationPeriodBalance(
            period_id=period.id,
            year_number=period.year_number,
            period_start=period.period_start,
            period_end=period.period_end,
            main_days=period.main_days,
            additional_days=period.additional_days,
            total_days=total,
            used_days=used_days,
            used_days_auto=period.used_days_auto or 0,
            used_days_manual=period.used_days_manual or 0,
            order_ids=period.order_ids,
            order_numbers=period.order_numbers,
            remaining_days=period.remaining_days if period.remaining_days is not None else total - used_days,
            vacations=[],
        )

    async def get_employee_periods(self, db: AsyncSession, employee_id: int) -> list[VacationPeriodBalance]:
        periods = await self._repo.get_by_employee(db, employee_id)
        today = date.today()
        result: list[VacationPeriodBalance] = []

        for period in sorted(periods, key=lambda p: p.year_number, reverse=True):
            if period.period_start > today:
                continue

            used_days = period.used_days or 0
            total_days_full = period.main_days + period.additional_days

            if period.period_start <= today <= period.period_end:
                from dateutil.relativedelta import relativedelta

                rd = relativedelta(today, period.period_start)
                months_passed = rd.years * 12 + rd.months
                if rd.days > 0:
                    months_passed += 1
                display_total = round(total_days_full / 12 * months_passed)
            else:
                display_total = total_days_full

            vac_result = await db.execute(
                select(Vacation)
                .options(selectinload(Vacation.order))
                .where(
                    Vacation.employee_id == employee_id,
                    Vacation.start_date >= period.period_start,
                    Vacation.start_date <= period.period_end,
                    Vacation.is_deleted == False,
                )
            )
            period_vacations = [
                {
                    "id": vacation.id,
                    "start_date": str(vacation.start_date),
                    "end_date": str(vacation.end_date),
                    "days_count": vacation.days_count,
                    "vacation_type": vacation.vacation_type,
                    "order_id": vacation.order_id,
                    "order_number": vacation.order.order_number if getattr(vacation, "order", None) else None,
                    "comment": vacation.comment,
                    "is_cancelled": vacation.is_cancelled,
                }
                for vacation in vac_result.scalars().all()
            ]

            result.append(
                VacationPeriodBalance(
                    period_id=period.id,
                    year_number=period.year_number,
                    period_start=period.period_start,
                    period_end=period.period_end,
                    main_days=period.main_days,
                    additional_days=period.additional_days,
                    total_days=display_total,
                    used_days=used_days,
                    used_days_auto=period.used_days_auto or 0,
                    used_days_manual=period.used_days_manual or 0,
                    order_ids=period.order_ids,
                    order_numbers=period.order_numbers,
                    remaining_days=display_total - used_days,
                    vacations=period_vacations,
                )
            )

        return result

    async def check_balance_before_create(self, db: AsyncSession, employee_id: int, duration_days: int) -> None:
        from app.repositories.vacation_repository import vacation_repository

        total_balance = await vacation_repository.get_vacation_balance(db, employee_id)
        total_remaining = total_balance["remaining_days"]

        if duration_days > total_remaining:
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно дней отпуска. Запрашивается: {duration_days}, доступно: {total_remaining}",
            )

    async def adjust_additional_days(
        self,
        db: AsyncSession,
        period_id: int,
        additional_days: int,
    ) -> VacationPeriodBalance:
        period = await self._repo.update_additional_days(db, period_id, additional_days)
        if not period:
            raise HTTPException(status_code=404, detail="Период отпусков не найден")

        used_days = await self._repo.get_used_days(db, period_id)
        total = period.main_days + period.additional_days

        return VacationPeriodBalance(
            period_id=period.id,
            year_number=period.year_number,
            period_start=period.period_start,
            period_end=period.period_end,
            main_days=period.main_days,
            additional_days=period.additional_days,
            total_days=total,
            used_days=used_days,
            used_days_auto=period.used_days_auto or 0,
            used_days_manual=period.used_days_manual or 0,
            order_ids=period.order_ids,
            order_numbers=period.order_numbers,
            remaining_days=total - used_days,
            vacations=[],
        )

    async def close_period(self, db: AsyncSession, period_id: int) -> VacationPeriodBalance:
        period = await self._repo.get_by_id(db, period_id)
        if not period:
            raise HTTPException(status_code=404, detail="Период отпусков не найден")

        total_days = period.main_days + period.additional_days
        effective_auto = period.used_days_auto or 0
        new_manual = total_days - effective_auto
        period.used_days_manual = new_manual
        period.used_days = effective_auto + new_manual
        period.remaining_days = 0

        await db.flush()
        await db.commit()
        await db.refresh(period)

        return VacationPeriodBalance(
            period_id=period.id,
            year_number=period.year_number,
            period_start=period.period_start,
            period_end=period.period_end,
            main_days=period.main_days,
            additional_days=period.additional_days,
            total_days=total_days,
            used_days=period.used_days,
            used_days_auto=period.used_days_auto or 0,
            used_days_manual=period.used_days_manual or 0,
            order_ids=period.order_ids,
            order_numbers=period.order_numbers,
            remaining_days=0,
            vacations=[],
        )

    async def partial_close_period(
        self,
        db: AsyncSession,
        period_id: int,
        remaining_days: int,
    ) -> VacationPeriodBalance:
        period = await self._repo.get_by_id(db, period_id)
        if not period:
            raise HTTPException(status_code=404, detail="Период отпусков не найден")

        total_days = period.main_days + period.additional_days
        current_remaining = total_days - (period.used_days or 0)
        remaining_days = max(0, min(remaining_days, total_days))

        effective_auto = period.used_days_auto or 0
        total_used_needed = total_days - remaining_days
        new_manual = total_used_needed - effective_auto

        if remaining_days > current_remaining and new_manual < 0:
            new_manual = 0

        period.used_days_manual = new_manual
        period.used_days = effective_auto + new_manual
        period.remaining_days = remaining_days

        await db.flush()
        await db.commit()
        await db.refresh(period)

        return VacationPeriodBalance(
            period_id=period.id,
            year_number=period.year_number,
            period_start=period.period_start,
            period_end=period.period_end,
            main_days=period.main_days,
            additional_days=period.additional_days,
            total_days=total_days,
            used_days=period.used_days,
            used_days_auto=period.used_days_auto or 0,
            used_days_manual=period.used_days_manual or 0,
            order_ids=period.order_ids,
            order_numbers=period.order_numbers,
            remaining_days=remaining_days,
            vacations=[],
        )


async def auto_use_days(
    db: AsyncSession,
    employee_id: int,
    days_to_use: int,
    order_id: int = None,
    order_number: str = None,
) -> None:
    repo = VacationPeriodRepository()
    result = await db.execute(
        select(VacationPeriod)
        .where(VacationPeriod.employee_id == employee_id)
        .order_by(VacationPeriod.year_number)
    )
    periods_sorted = list(result.scalars().all())

    remaining_to_use = days_to_use
    for period in periods_sorted:
        if remaining_to_use <= 0:
            break

        total = period.main_days + period.additional_days
        remaining = total - (period.used_days or 0)
        if remaining <= 0:
            continue

        days_to_take = min(remaining, remaining_to_use)
        if days_to_take > 0:
            await repo.add_used_days(db, period.id, days_to_take, order_id, order_number)
            remaining_to_use -= days_to_take


vacation_period_service = VacationPeriodService()
