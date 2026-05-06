from datetime import date
from typing import Optional

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vacation_period import VacationPeriod
from app.models.vacation import Vacation
from app.models.vacation_period_transaction import VacationPeriodTransaction


class VacationPeriodRepository:
    AUTO_TRANSACTION_TYPES = {
        "vacation_use",
        "vacation_use_adjusted",
        "recalculate_use",
        "vacation_restore",
    }

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
        periods_result = await db.execute(
            select(VacationPeriod).where(VacationPeriod.employee_id == employee_id)
        )
        periods = list(periods_result.scalars().all())
        count = len(periods)
        if not periods:
            return 0

        period_ids = [p.id for p in periods]

        # Self-reference from reversed_transaction_id can block deletes.
        await db.execute(
            update(VacationPeriodTransaction)
            .where(VacationPeriodTransaction.period_id.in_(period_ids))
            .values(reversed_transaction_id=None)
        )

        tx_result = await db.execute(
            select(VacationPeriodTransaction).where(VacationPeriodTransaction.period_id.in_(period_ids))
        )
        for tx in tx_result.scalars().all():
            await db.delete(tx)

        for period in periods:
            await db.delete(period)
        await db.flush()
        return count

    async def delete_by_ids(self, db: AsyncSession, period_ids: list[int]) -> int:
        if not period_ids:
            return 0
        periods_result = await db.execute(
            select(VacationPeriod).where(VacationPeriod.id.in_(period_ids))
        )
        periods = list(periods_result.scalars().all())
        if not periods:
            return 0

        await db.execute(
            update(VacationPeriodTransaction)
            .where(VacationPeriodTransaction.period_id.in_(period_ids))
            .values(reversed_transaction_id=None)
        )
        tx_result = await db.execute(
            select(VacationPeriodTransaction).where(VacationPeriodTransaction.period_id.in_(period_ids))
        )
        for tx in tx_result.scalars().all():
            await db.delete(tx)

        for period in periods:
            await db.delete(period)
        await db.flush()
        return len(periods)

    async def add_transaction(
        self,
        db: AsyncSession,
        period_id: int,
        days_count: int,
        transaction_type: str,
        order_id: int = None,
        order_number: str = None,
        vacation_id: int = None,
        original_order_id: int = None,
        adjustment_order_id: int = None,
        adjustment_id: int = None,
        manual_closure_id: int = None,
        reversed_transaction_id: int = None,
        is_reversal: bool = False,
        source_type: str = None,
        metadata: dict = None,
        description: str = None,
        created_by: str = None,
        recompute_totals: bool = False,
    ) -> VacationPeriodTransaction:
        """Создать запись транзакции для периода."""
        tx = VacationPeriodTransaction(
            period_id=period_id,
            vacation_id=vacation_id,
            order_id=order_id,
            order_number=order_number,
            days_count=days_count,
            transaction_type=transaction_type,
            original_order_id=original_order_id,
            adjustment_order_id=adjustment_order_id,
            adjustment_id=adjustment_id,
            manual_closure_id=manual_closure_id,
            reversed_transaction_id=reversed_transaction_id,
            is_reversal=is_reversal,
            source_type=source_type,
            details=metadata,
            description=description,
            created_by=created_by or "system",
        )
        db.add(tx)
        await db.flush()
        await db.refresh(tx)
        if recompute_totals:
            await self.recompute_period_totals(db, period_id)
        return tx

    async def get_transactions(self, db: AsyncSession, period_id: int) -> list[VacationPeriodTransaction]:
        """Получить все транзакции периода в хронологическом порядке (старые -> новые)."""
        result = await db.execute(
            select(VacationPeriodTransaction)
            .where(VacationPeriodTransaction.period_id == period_id)
            .order_by(VacationPeriodTransaction.created_at.asc(), VacationPeriodTransaction.id.asc())
        )
        return list(result.scalars().all())

    async def get_active_auto_transactions_by_vacation(
        self,
        db: AsyncSession,
        vacation_id: int,
    ) -> list[VacationPeriodTransaction]:
        adjustment_base_types = ("vacation_use", "vacation_use_adjusted", "recalculate_use")
        result = await db.execute(
            select(VacationPeriodTransaction)
            .where(
                VacationPeriodTransaction.vacation_id == vacation_id,
                VacationPeriodTransaction.transaction_type.in_(adjustment_base_types),
                VacationPeriodTransaction.is_reversal == False,
                VacationPeriodTransaction.days_count > 0,
            )
            .order_by(VacationPeriodTransaction.id.asc())
        )
        return list(result.scalars().all())

    async def delete_auto_transactions_for_employee(self, db: AsyncSession, employee_id: int) -> None:
        period_ids_result = await db.execute(
            select(VacationPeriod.id).where(VacationPeriod.employee_id == employee_id)
        )
        period_ids = [row[0] for row in period_ids_result.all()]
        if not period_ids:
            return

        tx_result = await db.execute(
            select(VacationPeriodTransaction).where(
                VacationPeriodTransaction.period_id.in_(period_ids),
                VacationPeriodTransaction.transaction_type.in_(self.AUTO_TRANSACTION_TYPES),
            )
        )
        for tx in tx_result.scalars().all():
            await db.delete(tx)
        await db.flush()
        for period_id in period_ids:
            await self.recompute_period_totals(db, period_id)

    async def delete_manual_transactions_for_employee(self, db: AsyncSession, employee_id: int) -> None:
        period_ids_result = await db.execute(
            select(VacationPeriod.id).where(VacationPeriod.employee_id == employee_id)
        )
        period_ids = [row[0] for row in period_ids_result.all()]
        if not period_ids:
            return

        tx_result = await db.execute(
            select(VacationPeriodTransaction).where(
                VacationPeriodTransaction.period_id.in_(period_ids),
                VacationPeriodTransaction.transaction_type.in_(("manual_close", "partial_close")),
            )
        )
        for tx in tx_result.scalars().all():
            await db.delete(tx)
        await db.flush()
        for period_id in period_ids:
            await self.recompute_period_totals(db, period_id)

    async def find_by_work_year(
        self,
        db: AsyncSession,
        employee_id: int,
        work_year_start: date,
        work_year_end: date,
    ) -> Optional[VacationPeriod]:
        result = await db.execute(
            select(VacationPeriod).where(
                VacationPeriod.employee_id == employee_id,
                VacationPeriod.period_start == work_year_start,
                VacationPeriod.period_end == work_year_end,
            )
        )
        return result.scalar_one_or_none()

    async def recompute_period_totals(self, db: AsyncSession, period_id: int) -> None:
        period = await self.get_by_id(db, period_id)
        if not period:
            return

        totals_result = await db.execute(
            select(
                func.coalesce(func.sum(VacationPeriodTransaction.days_count), 0),
                func.coalesce(
                    func.sum(VacationPeriodTransaction.days_count).filter(
                        VacationPeriodTransaction.transaction_type.in_(
                            ("manual_close", "partial_close")
                        )
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(VacationPeriodTransaction.days_count).filter(
                        ~VacationPeriodTransaction.transaction_type.in_(
                            ("manual_close", "partial_close")
                        )
                    ),
                    0,
                ),
            ).where(VacationPeriodTransaction.period_id == period_id)
        )
        total_used, manual_used, auto_used = totals_result.one()

        period.used_days = int(total_used or 0)
        period.used_days_manual = int(manual_used or 0)
        period.used_days_auto = int(auto_used or 0)

        total_days = (period.main_days or 0) + (period.additional_days or 0)
        remaining = total_days - period.used_days
        period.remaining_days = max(remaining, 0)

        order_rows = await db.execute(
            select(VacationPeriodTransaction.order_id, VacationPeriodTransaction.order_number)
            .where(
                VacationPeriodTransaction.period_id == period_id,
                VacationPeriodTransaction.order_id.isnot(None),
                VacationPeriodTransaction.days_count > 0,
            )
            .order_by(VacationPeriodTransaction.created_at.asc(), VacationPeriodTransaction.id.asc())
        )
        order_ids: list[str] = []
        order_numbers: list[str] = []
        seen_ids: set[int] = set()
        for order_id, order_number in order_rows.all():
            if order_id in seen_ids:
                continue
            seen_ids.add(order_id)
            order_ids.append(str(order_id))
            if order_number:
                order_numbers.append(str(order_number))

        period.order_ids = ",".join(order_ids) if order_ids else None
        period.order_numbers = ",".join(order_numbers) if order_numbers else None
        await db.flush()
