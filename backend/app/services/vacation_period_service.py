from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.vacation_period_repository import VacationPeriodRepository
from app.models.vacation_period import VacationPeriod
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
        """Создаёт один период отпусков.
        
        Рабочий год: от даты приёма +12 месяцев.
        1-й год: contract_start → contract_start + 1 год - 1 день
        """
        from dateutil.relativedelta import relativedelta
        period_start = contract_start + relativedelta(months=12 * (year_number - 1))
        period_end = period_start + relativedelta(months=12) - relativedelta(days=1)

        period = await self._repo.create(db, {
            "employee_id": employee_id,
            "period_start": period_start,
            "period_end": period_end,
            "main_days": MAIN_VACATION_DAYS,
            "additional_days": additional_days,
            "year_number": year_number,
        })

        return VacationPeriodBalance(
            period_id=period.id,
            year_number=period.year_number,
            period_start=period.period_start,
            period_end=period.period_end,
            main_days=period.main_days,
            additional_days=period.additional_days,
            total_days=period.main_days + period.additional_days,
            used_days=0,
            remaining_days=period.main_days + period.additional_days,
        )

    async def ensure_periods_for_employee(
        self,
        db: AsyncSession,
        employee_id: int,
        contract_start: date,
        additional_days: int = 0,
    ) -> None:
        """Создаёт все недостающие периоды И обновляет additional_days во всех существующих.
        
        Рабочий год считается от даты приёма (contract_start).
        """
        from dateutil.relativedelta import relativedelta
        
        today = date.today()
        existing = await self._repo.get_by_employee(db, employee_id)
        last_year = max((p.year_number for p in existing), default=0)

        # Обновляем additional_days во ВСХ существующих периодах
        for p in existing:
            if p.additional_days != additional_days:
                await self._repo.update_additional_days(db, p.id, additional_days)

        # Сколько рабочих лет прошло от contract_start
        rd = relativedelta(today, contract_start)
        years_passed = rd.years
        # Если прошло хотя бы 0 дней следующего года - это уже следующий рабочий год
        if rd.months > 0 or rd.days > 0:
            current_year_number = years_passed + 1 + 1  # +1 за текущий год
        else:
            current_year_number = years_passed + 1

        # Создаём недостающие периоды
        for yn in range(last_year + 1, current_year_number + 1):
            await self.create_period(db, employee_id, contract_start, yn, additional_days)

    async def get_current_period(
        self,
        db: AsyncSession,
        employee_id: int,
        today: Optional[date] = None,
    ) -> Optional[VacationPeriod]:
        """Возвращает период, в который попадает сегодня."""
        return await self._repo.get_current_period(db, employee_id, today)

    async def get_balance(self, db: AsyncSession, period_id: int) -> VacationPeriodBalance:
        """Возвращает баланс периода (used_days считается запросом)."""
        period = await self._repo.get_by_id(db, period_id)
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
            remaining_days=total - used_days,
        )

    async def get_employee_periods(self, db: AsyncSession, employee_id: int) -> list[VacationPeriodBalance]:
        """Все периоды сотрудника с балансом. Сортировка от новых к старым."""
        periods = await self._repo.get_by_employee(db, employee_id)
        today = date.today()
        result = []
        for p in sorted(periods, key=lambda x: x.year_number, reverse=True):
            # Скрываем будущие периоды
            if p.period_start > today:
                continue
            
            # Используем used_days напрямую из модели (новая система периодов)
            used_days = p.used_days or 0
            total_days_full = p.main_days + p.additional_days
            
            # Проверяем, был ли период закрыт вручную
            # Для этого сравниваем used_days в модели с реальными днями из отпусков
            real_used_days = await self._repo.get_used_days(db, p.id, today)
            manually_closed = used_days > real_used_days

            # Для текущего периода считаем accrued дни пропорционально
            # НО только если период не был закрыт вручную
            if p.period_start <= today <= p.period_end and not manually_closed:
                total_days_in_period = (p.period_end - p.period_start).days + 1
                days_passed = (today - p.period_start).days + 1
                accrued = round(total_days_full * days_passed / total_days_in_period)
                total = accrued
            else:
                total = total_days_full

            result.append(VacationPeriodBalance(
                period_id=p.id,
                year_number=p.year_number,
                period_start=p.period_start,
                period_end=p.period_end,
                main_days=p.main_days,
                additional_days=p.additional_days,
                total_days=total,
                used_days=used_days,
                remaining_days=total - used_days,
            ))
        return result

    async def check_balance_before_create(
        self,
        db: AsyncSession,
        employee_id: int,
        duration_days: int,
    ) -> None:
        """Проверяет, достаточно ли дней отпуска. Бросает 400 если нет."""
        today = date.today()
        current_period = await self._repo.get_current_period(db, employee_id, today=today)
        if not current_period:
            raise HTTPException(
                status_code=400,
                detail="Нет активного периода отпусков. Убедитесь, что у сотрудника есть период.",
            )

        balance = await self.get_balance(db, current_period.id)
        if duration_days > balance.remaining_days:
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно дней отпуска. Запрашивается: {duration_days}, доступно: {balance.remaining_days}",
            )

    async def adjust_additional_days(
        self,
        db: AsyncSession,
        period_id: int,
        additional_days: int,
    ) -> VacationPeriodBalance:
        """Обновить дополнительные дни периода."""
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
            remaining_days=total - used_days,
        )

    async def close_period(
        self,
        db: AsyncSession,
        period_id: int,
    ) -> VacationPeriodBalance:
        """Закрыть период полностью - списать все оставшиеся дни."""
        period = await self._repo.get_by_id(db, period_id)
        if not period:
            raise HTTPException(status_code=404, detail="Период отпусков не найден")
        
        total_days = period.main_days + period.additional_days
        current_used = period.used_days or 0
        
        print(f"[close_period] period_id={period_id}")
        print(f"[close_period] BEFORE: used_days={current_used}, total_days={total_days}")
        
        # Устанавливаем used_days = total_days (все дни списываются)
        period.used_days = total_days
        
        await db.flush()
        await db.commit()
        await db.refresh(period)
        
        print(f"[close_period] AFTER: used_days={period.used_days}")
        
        return VacationPeriodBalance(
            period_id=period.id,
            year_number=period.year_number,
            period_start=period.period_start,
            period_end=period.period_end,
            main_days=period.main_days,
            additional_days=period.additional_days,
            total_days=total_days,
            used_days=period.used_days,
            remaining_days=0,
        )

    async def partial_close_period(
        self,
        db: AsyncSession,
        period_id: int,
        remaining_days: int,
    ) -> VacationPeriodBalance:
        """Частично закрыть период - оставить указанное количество дней."""
        period = await self._repo.get_by_id(db, period_id)
        if not period:
            raise HTTPException(status_code=404, detail="Период отпусков не найден")
        
        total_days = period.main_days + period.additional_days
        
        # Проверяем что remaining_days не больше total
        if remaining_days > total_days:
            remaining_days = total_days
        if remaining_days < 0:
            remaining_days = 0
            
        # Устанавливаем used_days так, чтобы осталось remaining_days
        # used_days = total - remaining
        period.used_days = total_days - remaining_days
        
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
            remaining_days=remaining_days,
        )


async def auto_use_days(
        db: AsyncSession, employee_id: int, days_to_use: int
    ) -> None:
        print(f"[auto_use_days] START: employee_id={employee_id}, days_to_use={days_to_use}")
        
        service = VacationPeriodService()
        periods = await service.get_employee_periods(db, employee_id)
        print(f"[auto_use_days] periods count: {len(periods)}")
        
        # Сортируем от старых к новым (по year_number по возрастанию)
        periods_sorted = sorted(periods, key=lambda p: p.year_number)
        
        remaining_to_use = days_to_use
        repo = VacationPeriodRepository()
        for period in periods_sorted:
            print(f"[auto_use_days] period={period.year_number}, remaining_days={period.remaining_days}")
            if remaining_to_use <= 0:
                break
            if period.remaining_days <= 0:
                continue
            days_to_take = min(period.remaining_days, remaining_to_use)
            print(f"[auto_use_days] taking {days_to_take} days from period {period.year_number}")
            if days_to_take > 0:
                await repo.add_used_days(db, period.period_id, days_to_take)
                remaining_to_use -= days_to_take
        
        print(f"[auto_use_days] finished, remaining_to_use={remaining_to_use}")
        # Removed commit - let the caller handle transaction


vacation_period_service = VacationPeriodService()
