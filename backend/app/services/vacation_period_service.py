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
            current_year_number = years_passed + 1
        else:
            current_year_number = years_passed

        # Создаём недостающие периоды
        for yn in range(last_year + 1, current_year_number + 1):
            await self.create_period(
                db, employee_id, contract_start, yn, additional_days
            )

    async def get_current_period(
        self,
        db: AsyncSession,
        employee_id: int,
        today: Optional[date] = None,
    ) -> Optional[VacationPeriod]:
        """Возвращает период, в который попадает сегодня."""
        return await self._repo.get_current_period(db, employee_id, today)

    async def get_balance(
        self, db: AsyncSession, period_id: int
    ) -> VacationPeriodBalance:
        """Возвращает баланс периода."""
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
        )

    async def get_employee_periods(
        self, db: AsyncSession, employee_id: int
    ) -> list[VacationPeriodBalance]:
        """Все периоды сотрудника с балансом. Сортировка от новых к старым."""
        from sqlalchemy import select, text
        from app.models.vacation_period import VacationPeriod
        from app.models.vacation import Vacation
        from app.models.order import Order
        
        # ПОЛУЧИТЬ периоды через параметризованный запрос
        emp_result = await db.execute(
            text("SELECT id FROM vacation_periods WHERE employee_id = :emp_id ORDER BY year_number DESC"),
            {"emp_id": employee_id}
        )
        period_ids = [row[0] for row in emp_result.fetchall()]
        
        period_objects = []
        for pid in period_ids:
            # Fresh select для каждого периода
            p_result = await db.execute(
                select(VacationPeriod).where(VacationPeriod.id == pid)
            )
            p = p_result.scalar_one_or_none()
            if p:
                period_objects.append(p)
        
        today = date.today()
        result = []
        for p in period_objects:
            # Скрываем будущие периоды
            if p.period_start > today:
                continue

            # ИСПОЛЬЗУЕМ period.used_days - оно правильно установлено через auto_use_days
            used_days = p.used_days or 0
            total_days_full = p.main_days + p.additional_days

            # РАСЧЁТ display значений для текущего периода (accrued logic)
            if p.period_start <= today <= p.period_end:
                # Для текущего периода считаем accrued дни помесячно
                from dateutil.relativedelta import relativedelta

                rd = relativedelta(today, p.period_start)
                months_passed = rd.years * 12 + rd.months
                if rd.days > 0:
                    months_passed += 1

                accrued = round(total_days_full / 12 * months_passed)
                display_total = accrued
                display_used_days = used_days
            else:
                display_total = total_days_full
                display_used_days = used_days

            # Получаем отпуска для этого периода (по order_ids)
            period_vacations = []
            if p.order_ids:
                order_ids_list = [int(x) for x in p.order_ids.split(',') if x]
                
                # Получаем номера приказов
                order_numbers = {}
                if order_ids_list:
                    orders_result = await db.execute(
                        select(Order.id, Order.order_number).where(Order.id.in_(order_ids_list))
                    )
                    order_numbers = {row[0]: row[1] for row in orders_result.all()}
                
                # Получаем отпуска для каждого приказа
                for oid in order_ids_list:
                    vac_result = await db.execute(
                        select(Vacation).where(
                            Vacation.order_id == oid,
                            Vacation.is_deleted == False,
                            Vacation.is_cancelled == False
                        )
                    )
                    vac = vac_result.scalar_one_or_none()
                    if vac:
                        period_vacations.append({
                            "id": vac.id,
                            "order_id": oid,
                            "order_number": order_numbers.get(oid),
                            "start_date": str(vac.start_date),
                            "end_date": str(vac.end_date),
                            "days_count": vac.days_count,
                            "vacation_type": vac.vacation_type,
                            "is_cancelled": vac.is_cancelled,
                        })

            result.append(
                VacationPeriodBalance(
                    period_id=p.id,
                    year_number=p.year_number,
                    period_start=p.period_start,
                    period_end=p.period_end,
                    main_days=p.main_days,
                    additional_days=p.additional_days,
                    total_days=display_total,
                    used_days=display_used_days,
                    used_days_auto=p.used_days_auto or 0,
                    used_days_manual=p.used_days_manual or 0,
                    order_ids=p.order_ids,
                    order_numbers=p.order_numbers,
                    remaining_days=display_total - display_used_days,
                    vacations=period_vacations,
                )
            )
        return result

    async def check_balance_before_create(
        self,
        db: AsyncSession,
        employee_id: int,
        duration_days: int,
    ) -> None:
        """Проверяет, достаточно ли дней отпуска. Бросает 400 если нет.
        Проверяет общий баланс по всем периодам (включая прошедшие и текущий)."""
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
        effective_auto = period.used_days_auto or 0
        
        # Формула: used_manual = (total - 0) - used_auto
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
        current_remaining = total_days - (period.used_days or 0)
        
        # Проверяем что remaining_days не больше total
        if remaining_days > total_days:
            remaining_days = total_days
        if remaining_days < 0:
            remaining_days = 0

        effective_auto = period.used_days_auto or 0
        
        # Формула: used_manual = (total - remaining) - used_auto
        total_used_needed = total_days - remaining_days
        new_manual = total_used_needed - effective_auto
        
        # Если увеличиваем остаток (восстановление) и new_manual < 0 → обнуляем
        # Нельзя уходить в минус при восстановлении
        is_restoring = remaining_days > current_remaining
        if is_restoring and new_manual < 0:
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
        )


async def sync_period_used_days(self, db: AsyncSession, employee_id: int) -> None:
    """Синхронизирует period.used_days для всех периодов сотрудника.

    ДИНАМИЧЕСКИЙ расчёт — всегда считает из таблицы vacations.
    Вызывается после create/delete отпуска.
    """
    repo = VacationPeriodRepository()
    periods = await repo.get_by_employee(db, employee_id)
    
    for period in periods:
        real_used = await repo.get_used_days(db, period.id)
        period.used_days = real_used
        print(f"[sync_period_used_days] period {period.year_number}: used_days set to {real_used}")
    
    await db.flush()
    await db.commit()
    print(f"[sync_period_used_days] committed for employee_id={employee_id}")


async def auto_use_days(db: AsyncSession, employee_id: int, days_to_use: int, order_id: int = None, order_number: str = None) -> None:
    """Автосписание дней при создании приказа. Списываем со старых периодов первыми."""
    from app.models.vacation_period import VacationPeriod
    from sqlalchemy import select
    
    # Получаем периоды напрямую из БД
    result = await db.execute(
        select(VacationPeriod)
        .where(VacationPeriod.employee_id == employee_id)
        .order_by(VacationPeriod.year_number)
    )
    all_periods = list(result.scalars().all())
    
    # Сортируем от СТАРЫХ к НОВЫМ (year_number ASC)
    periods_sorted = sorted(all_periods, key=lambda p: p.year_number)
    
    print(f"[auto_use_days] periods count: {len(periods_sorted)}")
    for p in periods_sorted:
        print(f"[auto_use_days] period {p.year_number}: remaining={p.main_days + p.additional_days - (p.used_days or 0)}")
    
    remaining_to_use = days_to_use
    repo = VacationPeriodRepository()
    
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
            print(f"[auto_use_days] took {days_to_take} from period {period.year_number}, remain={remaining_to_use}")
    # Removed commit - let the caller handle transaction


vacation_period_service = VacationPeriodService()
