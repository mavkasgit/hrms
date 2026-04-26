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
        hire_date: date,
        year_number: int,
        additional_days: int = 0,
    ) -> VacationPeriodBalance:
        from dateutil.relativedelta import relativedelta

        period_start = hire_date + relativedelta(months=12 * (year_number - 1))
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
        hire_date: date,
        additional_days: int = 0,
    ) -> None:
        from dateutil.relativedelta import relativedelta

        today = date.today()
        existing = await self._repo.get_by_employee(db, employee_id)

        # Проверяем наличие дублей по year_number или несоответствие hire_date
        if existing:
            first_period = min(existing, key=lambda p: p.year_number)
            expected_start = hire_date + relativedelta(months=12 * (first_period.year_number - 1))
            year_numbers = [p.year_number for p in existing]
            has_duplicates = len(year_numbers) != len(set(year_numbers))
            if has_duplicates or first_period.period_start != expected_start:
                await self._repo.delete_all_by_employee(db, employee_id)
                existing = []

        existing_years = {p.year_number for p in existing}
        last_year = max(existing_years, default=0)

        for period in existing:
            if period.additional_days != additional_days:
                await self._repo.update_additional_days(db, period.id, additional_days)

        rd = relativedelta(today, hire_date)
        years_passed = rd.years
        current_year_number = years_passed + 1 if rd.months > 0 or rd.days > 0 else years_passed

        for year_number in range(last_year + 1, current_year_number + 1):
            if year_number not in existing_years:
                await self.create_period(db, employee_id, hire_date, year_number, additional_days)

    async def check_periods_mismatch(self, db: AsyncSession, employee_id: int, hire_date: date) -> bool:
        """Проверяет, соответствуют ли существующие периоды текущему hire_date."""
        from dateutil.relativedelta import relativedelta

        existing = await self._repo.get_by_employee(db, employee_id)
        if not existing:
            return False

        first_period = min(existing, key=lambda p: p.year_number)
        expected_start = hire_date + relativedelta(months=12 * (first_period.year_number - 1))
        return first_period.period_start != expected_start

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
            used_days = period.used_days or 0
            total_days_full = period.main_days + period.additional_days

            if period.period_start <= today <= period.period_end:
                from dateutil.relativedelta import relativedelta

                rd = relativedelta(today, period.period_start)
                months_passed = rd.years * 12 + rd.months
                if rd.days > 0:
                    months_passed += 1
                display_total = round(total_days_full / 12 * months_passed)
            elif period.period_start > today:
                display_total = 0
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
.order_by(Vacation.start_date.desc())
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

            # Получаем транзакции периода
            from app.schemas.vacation_period import VacationPeriodTransactionResponse
            transactions = await self._repo.get_transactions(db, period.id)
            tx_list = [
                VacationPeriodTransactionResponse.model_validate(tx)
                for tx in transactions
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
                    transactions=tx_list,
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

        # Создаём транзакцию ручного закрытия
        if new_manual > 0:
            await self._repo.add_transaction(
                db,
                period_id=period.id,
                days_count=new_manual,
                transaction_type="manual_close",
                description=f"Закрытие периода: списано {new_manual} дней",
            )

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

        # Создаём транзакцию частичного закрытия
        if new_manual > 0:
            await self._repo.add_transaction(
                db,
                period_id=period.id,
                days_count=new_manual,
                transaction_type="partial_close",
                description=f"Частичное закрытие: списано {new_manual} дней, остаток {remaining_days}",
            )

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

    async def recalculate_periods(self, db: AsyncSession, employee_id: int) -> list[VacationPeriodBalance]:
        """Пересоздать периоды и заново распределить дни отпусков по порядку."""
        from app.repositories.employee_repository import EmployeeRepository
        from app.models.vacation import Vacation

        employee_repo = EmployeeRepository()
        employee = await employee_repo.get_by_id(db, employee_id)
        if not employee or not employee.hire_date:
            raise HTTPException(status_code=400, detail="У сотрудника не указана дата приёма")

        # Удаляем все периоды (cascade удалит транзакции)
        await self._repo.delete_all_by_employee(db, employee_id)

        # Создаём периоды заново
        await self.ensure_periods_for_employee(
            db,
            employee_id,
            employee.hire_date,
            employee.additional_vacation_days or 0,
        )

        # Получаем все отпуска сотрудника (не удалённые, не отменённые, с приказом)
        result = await db.execute(
            select(Vacation)
            .where(
                Vacation.employee_id == employee_id,
                Vacation.is_deleted == False,
                Vacation.is_cancelled == False,
                Vacation.order_id.isnot(None),
            )
            .order_by(Vacation.start_date.asc())
        )
        vacations = list(result.scalars().all())

        # По порядку от самого старого отпуска распределяем дни по периодам
        for vacation in vacations:
            # Получаем номер приказа
            from app.repositories.order_repository import OrderRepository
            order_repo = OrderRepository()
            order = await order_repo.get_by_id(db, vacation.order_id)
            order_number = order.order_number if order else str(vacation.order_id)

            await auto_use_days(
                db,
                employee_id=employee_id,
                days_to_use=vacation.days_count,
                hire_date=employee.hire_date,
                additional_days=employee.additional_vacation_days or 0,
                order_id=vacation.order_id,
                order_number=order_number,
                is_recalc=True,
            )

        await db.commit()
        return await self.get_employee_periods(db, employee_id)


async def auto_use_days(
    db: AsyncSession,
    employee_id: int,
    days_to_use: int,
    hire_date: date = None,
    additional_days: int = 0,
    order_id: int = None,
    order_number: str = None,
    is_recalc: bool = False,
) -> None:
    from dateutil.relativedelta import relativedelta

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
            desc = f"Автосписание по приказу {order_number or order_id}: {days_to_take} дней"
            if is_recalc:
                desc += " (Перезаписан)"
            await repo.add_transaction(
                db,
                period_id=period.id,
                days_count=days_to_take,
                transaction_type="auto_use",
                order_id=order_id,
                order_number=order_number,
                description=desc,
            )
            remaining_to_use -= days_to_take

    # Если остались непокрытые дни — создаём будущие периоды
    while remaining_to_use > 0 and hire_date is not None:
        last_year = max((p.year_number for p in periods_sorted), default=0)
        next_year = last_year + 1

        period_start = hire_date + relativedelta(months=12 * (next_year - 1))
        period_end = period_start + relativedelta(months=12) - relativedelta(days=1)

        new_period = await repo.create(
            db,
            {
                "employee_id": employee_id,
                "period_start": period_start,
                "period_end": period_end,
                "main_days": MAIN_VACATION_DAYS,
                "additional_days": additional_days,
                "year_number": next_year,
            },
        )
        periods_sorted.append(new_period)

        total = new_period.main_days + new_period.additional_days
        days_to_take = min(total, remaining_to_use)
        await repo.add_used_days(db, new_period.id, days_to_take, order_id, order_number)
        desc = f"Автосписание по приказу {order_number or order_id}: {days_to_take} дней (будущий период)"
        if is_recalc:
            desc += " (Перезаписан)"
        await repo.add_transaction(
            db,
            period_id=new_period.id,
            days_count=days_to_take,
            transaction_type="auto_use",
            order_id=order_id,
            order_number=order_number,
            description=desc,
        )
        remaining_to_use -= days_to_take


vacation_period_service = VacationPeriodService()
