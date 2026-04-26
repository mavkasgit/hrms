from datetime import date
from typing import Optional

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vacation_period import VacationPeriod
from app.models.vacation import Vacation
from app.models.vacation_period_transaction import VacationPeriodTransaction


class VacationPeriodRepository:
    async def create(self, db: AsyncSession, data: dict) -> VacationPeriod:
        period = VacationPeriod(**data)
        db.add(period)
        await db.flush()
        await db.refresh(period)
        return period

    async def get_by_id(self, db: AsyncSession, period_id: int) -> Optional[VacationPeriod]:
        result = await db.execute(
            select(VacationPeriod)
            .where(VacationPeriod.id == period_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_by_employee(self, db: AsyncSession, employee_id: int) -> list[VacationPeriod]:
        result = await db.execute(
            select(VacationPeriod)
            .where(VacationPeriod.employee_id == employee_id)
            .execution_options(populate_existing=True)
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
        Если today передан — считаем только до этой даты (accrued).
        Если today=None — считаем все отпуска за период.
        """
        period = await self.get_by_id(db, period_id)
        if not period:
            return 0

        if today is None:
            today = date.today()

        if today > period.period_end:
            end_date = period.period_end
        else:
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

    async def get_all_used_days(self, db: AsyncSession, period_id: int) -> int:
        """Считаем ВСЕ использованные дни из таблицы vacations за период."""
        from sqlalchemy import select as sa_select
        period = await self.get_by_id(db, period_id)
        if not period:
            return 0

        query = sa_select(func.coalesce(func.sum(Vacation.days_count), 0)).where(
            and_(
                Vacation.employee_id == period.employee_id,
                Vacation.start_date >= period.period_start,
                Vacation.start_date <= period.period_end,
                Vacation.is_deleted == False,
                Vacation.is_cancelled == False,
            )
        )
        result = await db.execute(query)
        return int(result.scalar() or 0)

    async def update_additional_days(self, db: AsyncSession, period_id: int, additional_days: int) -> Optional[VacationPeriod]:
        period = await self.get_by_id(db, period_id)
        if not period:
            return None
        period.additional_days = additional_days
        await db.flush()
        await db.refresh(period)
        return period

    async def add_used_days(self, db: AsyncSession, period_id: int, days: int, order_id: int = None, order_number: str = None) -> None:
        """Добавить использованные дни к периоду (автосписание при создании приказа)."""
        import json
        
        period = await self.get_by_id(db, period_id)
        if not period:
            print(f"[add_used_days] ERROR: period {period_id} not found")
            return
        
        old_used = period.used_days or 0
        old_auto = period.used_days_auto or 0
        
        period.used_days = old_used + days
        period.used_days_auto = old_auto + days
        
        if order_id:
            # Добавляем order_id в список
            existing_ids = period.order_ids or ""
            if existing_ids:
                period.order_ids = f"{existing_ids},{order_id}"
            else:
                period.order_ids = str(order_id)
            
            # Добавляем order_number в список
            if order_number:
                existing_numbers = period.order_numbers or ""
                if existing_numbers:
                    period.order_numbers = f"{existing_numbers},{order_number}"
                else:
                    period.order_numbers = str(order_number)
            
            # Отслеживаем сколько дней списал этот приказ
            order_days_map = {}
            if period.order_days_map:
                try:
                    order_days_map = json.loads(period.order_days_map)
                except:
                    order_days_map = {}
            
            order_key = str(order_id)
            order_days_map[order_key] = order_days_map.get(order_key, 0) + days
            period.order_days_map = json.dumps(order_days_map)
        
        print(f"[add_used_days] period_id={period_id}, old_used={old_used}, adding={days}, new_used={period.used_days}, auto={period.used_days_auto}")
        await db.flush()
        await db.refresh(period)
        print(f"[add_used_days] flushed and refreshed, period.used_days={period.used_days}")

    async def remove_used_days(self, db: AsyncSession, period_id: int, days: int, order_id: int = None) -> None:
        """Уменьшить использованные дни при удалении отпуска."""
        import json
        
        period = await self.get_by_id(db, period_id)
        if not period:
            print(f"[remove_used_days] ERROR: period {period_id} not found")
            return
        
        # Если есть order_id, используем order_days_map для точного расчета
        if order_id and period.order_days_map:
            try:
                order_days_map = json.loads(period.order_days_map)
                order_key = str(order_id)
                days_to_remove = order_days_map.get(order_key, 0)
                
                if days_to_remove > 0:
                    old_used = period.used_days or 0
                    period.used_days = max(0, old_used - days_to_remove)
                    
                    old_auto = period.used_days_auto or 0
                    period.used_days_auto = max(0, old_auto - days_to_remove)
                    
                    # Удаляем из order_days_map
                    del order_days_map[order_key]
                    period.order_days_map = json.dumps(order_days_map) if order_days_map else None
                    
                    print(f"[remove_used_days] period_id={period_id}, order_id={order_id}, removed={days_to_remove}, new_used={period.used_days}")
            except Exception as e:
                print(f"[remove_used_days] ERROR parsing order_days_map: {e}")
                # Fallback: вычитаем переданное значение
                old_used = period.used_days or 0
                period.used_days = max(0, old_used - days)
                old_auto = period.used_days_auto or 0
                period.used_days_auto = max(0, old_auto - days)
        else:
            # Fallback: вычитаем переданное значение
            old_used = period.used_days or 0
            period.used_days = max(0, old_used - days)
            old_auto = period.used_days_auto or 0
            period.used_days_auto = max(0, old_auto - days)
        
        # Удаляем order_id из списка
        if order_id and period.order_ids:
            ids = [int(x) for x in period.order_ids.split(',') if x]
            if order_id in ids:
                ids.remove(order_id)
                period.order_ids = ','.join(map(str, ids)) if ids else None
        
        await db.flush()
        await db.refresh(period)

    async def delete_all_by_employee(self, db: AsyncSession, employee_id: int) -> int:
        """Удалить все периоды отпусков сотрудника."""
        result = await db.execute(
            select(VacationPeriod).where(VacationPeriod.employee_id == employee_id)
        )
        periods = result.scalars().all()
        count = len(periods)
        for period in periods:
            await db.delete(period)
        await db.flush()
        return count

    async def add_transaction(
        self,
        db: AsyncSession,
        period_id: int,
        days_count: int,
        transaction_type: str,
        order_id: int = None,
        order_number: str = None,
        vacation_id: int = None,
        description: str = None,
        created_by: str = None,
    ) -> VacationPeriodTransaction:
        """Создать запись транзакции для периода."""
        tx = VacationPeriodTransaction(
            period_id=period_id,
            vacation_id=vacation_id,
            order_id=order_id,
            order_number=order_number,
            days_count=days_count,
            transaction_type=transaction_type,
            description=description,
            created_by=created_by or "system",
        )
        db.add(tx)
        await db.flush()
        await db.refresh(tx)
        return tx

    async def get_transactions(self, db: AsyncSession, period_id: int) -> list[VacationPeriodTransaction]:
        """Получить все транзакции периода, отсортированные по дате отпуска (новые сверху)."""
        from app.models.vacation import Vacation
        result = await db.execute(
            select(VacationPeriodTransaction)
            .outerjoin(Vacation, VacationPeriodTransaction.order_id == Vacation.order_id)
            .where(VacationPeriodTransaction.period_id == period_id)
            .order_by(Vacation.start_date.desc().nulls_last(), VacationPeriodTransaction.created_at.desc())
        )
        return list(result.scalars().all())
