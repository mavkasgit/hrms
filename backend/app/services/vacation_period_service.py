from datetime import date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.vacation import Vacation
from app.models.vacation_period import VacationPeriod
from app.repositories.vacation_period_repository import VacationPeriodRepository
from app.repositories.hire_date_adjustment_repository import HireDateAdjustmentRepository
from app.repositories.vacation_adjustment_repository import VacationAdjustmentRepository
from app.repositories.vacation_period_manual_closure_repository import (
    VacationPeriodManualClosureRepository,
)
from app.schemas.vacation_period import VacationPeriodBalance

MAIN_VACATION_DAYS = 24


class VacationPeriodService:
    def __init__(self):
        self._repo = VacationPeriodRepository()
        self._adjustment_repo = HireDateAdjustmentRepository()
        self._vacation_adjustment_repo = VacationAdjustmentRepository()
        self._manual_closure_repo = VacationPeriodManualClosureRepository()

    async def get_effective_start_date(self, db: AsyncSession, employee_id: int, hire_date: date) -> date:
        """Возвращает дату начала для создания периодов: последнюю adjustment_date или hire_date."""
        latest = await self._adjustment_repo.get_latest(db, employee_id)
        return latest.adjustment_date if latest else hire_date

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

    async def _get_series_boundaries(self, db: AsyncSession, employee_id: int, hire_date: date) -> list[date]:
        """Возвращает упорядоченные точки начала серий: [hire_date, adjustment1, adjustment2, ...]."""
        adjustments = await self._adjustment_repo.get_by_employee(db, employee_id)
        return [hire_date] + [adj.adjustment_date for adj in adjustments]

    async def _find_series_start(self, period_start: date, boundaries: list[date]) -> date:
        """Определяет к какой серии относится период по его period_start."""
        result = boundaries[0]
        for boundary in boundaries:
            if period_start >= boundary:
                result = boundary
            else:
                break
        return result

    async def _trim_periods_before_boundary(self, db: AsyncSession, employee_id: int, cutoff_date: date) -> None:
        """Обрезать period_end и закрыть все периоды которые заканчиваются после cutoff_date."""
        from datetime import timedelta
        from dateutil.relativedelta import relativedelta

        all_periods = await self._repo.get_by_employee(db, employee_id)
        max_end = cutoff_date - timedelta(days=1)

        for p in all_periods:
            if p.period_end > max_end and p.period_start < cutoff_date:
                # Обрезаем период до cutoff_date - 1 day
                p.period_end = max_end
                
                # Закрываем период — списываем все оставшиеся дни
                total = p.main_days + p.additional_days
                current_used = p.used_days or 0
                remaining = total - current_used
                if remaining > 0:
                    closure, _ = await self._manual_closure_repo.upsert_for_period(
                        db,
                        employee_id=p.employee_id,
                        work_year_start=p.period_start,
                        work_year_end=p.period_end,
                        days_count=remaining,
                        closure_type="partial_close",
                        remaining_days=0,
                        reason=f"Автоматическое закрытие при корректировке от {cutoff_date}: Было—{remaining} дн., остаток—0 дн.",
                    )
                    await self._repo.add_transaction(
                        db,
                        period_id=p.id,
                        days_count=remaining,
                        transaction_type="partial_close",
                        manual_closure_id=closure.id,
                        description=f"Автоматическое закрытие при корректировке от {cutoff_date}: Было—{remaining} дн., остаток—0 дн.",
                    )
                    # Обновляем поля period напрямую
                    p.used_days_manual = remaining
                    p.used_days = current_used + remaining
                    p.remaining_days = 0
                await db.flush()

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

        # Получаем все точки начала серий
        boundaries = await self._get_series_boundaries(db, employee_id, hire_date)

        if len(boundaries) > 1:
            # Обрезаем периоды предыдущих серий чтобы не пересекались со следующей
            for i, boundary in enumerate(boundaries[:-1]):
                next_boundary = boundaries[i + 1]
                await self._trim_periods_before_boundary(db, employee_id, next_boundary)

            # Перечитываем периоды после обрезки
            existing = await self._repo.get_by_employee(db, employee_id)

            # Группируем периоды по сериям
            series_periods: dict[date, list] = {b: [] for b in boundaries}
            for p in existing:
                series_start = await self._find_series_start(p.period_start, boundaries)
                series_periods[series_start].append(p)

            # Все серии кроме последней — только обновляем additional_days
            for series_start in boundaries[:-1]:
                for period in series_periods[series_start]:
                    if period.additional_days != additional_days:
                        await self._repo.update_additional_days(db, period.id, additional_days)

            # Последняя серия — создаём/обновляем
            latest_boundary = boundaries[-1]
            latest_periods = series_periods[latest_boundary]

            # Проверяем дубли в последней серии
            if latest_periods:
                year_numbers = [p.year_number for p in latest_periods]
                has_duplicates = len(year_numbers) != len(set(year_numbers))
                first_period = min(latest_periods, key=lambda p: p.year_number)
                expected_start = latest_boundary + relativedelta(months=12 * (first_period.year_number - 1))
                if has_duplicates or first_period.period_start != expected_start:
                    # Удаляем только периоды последней серии
                    for p in latest_periods:
                        await db.delete(p)
                    await db.flush()
                    latest_periods = []

            existing_years = {p.year_number for p in latest_periods}
            last_year = max(existing_years, default=0)

            for period in latest_periods:
                if period.additional_days != additional_days:
                    await self._repo.update_additional_days(db, period.id, additional_days)

            rd = relativedelta(today, latest_boundary)
            years_passed = rd.years
            current_year_number = years_passed + 1 if rd.months > 0 or rd.days > 0 else years_passed

            for year_number in range(last_year + 1, current_year_number + 1):
                if year_number not in existing_years:
                    await self.create_period(db, employee_id, latest_boundary, year_number, additional_days)
        else:
            # Нет корректировок — единственная серия от hire_date
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

        # Сортируем по period_start от новых к старым (корректно для двух серий)
        for period in sorted(periods, key=lambda p: p.period_start, reverse=True):
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
                .options(
                    selectinload(Vacation.order),
                    selectinload(Vacation.recall_order),
                    selectinload(Vacation.postpone_order),
                )
                .where(
                    Vacation.employee_id == employee_id,
                    Vacation.start_date >= period.period_start,
                    Vacation.start_date <= period.period_end,
                    Vacation.is_deleted == False,
                )
            .order_by(Vacation.start_date.desc())
            )
            vacations_in_period = list(vac_result.scalars().all())
            adjustments_by_vacation: dict[int, int] = {}
            for vacation in vacations_in_period:
                latest_adj = await self._vacation_adjustment_repo.get_latest_by_vacation(db, vacation.id)
                if latest_adj:
                    adjustments_by_vacation[vacation.id] = latest_adj.actual_days

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
                    "is_recalled": vacation.is_recalled,
                    "recall_date": str(vacation.recall_date) if vacation.recall_date else None,
                    "recall_order_id": vacation.recall_order_id,
                    "recall_order_number": vacation.recall_order.order_number if getattr(vacation, "recall_order", None) else None,
                    "original_days": vacation.days_count if vacation.id in adjustments_by_vacation else None,
                    "actual_days": adjustments_by_vacation.get(vacation.id),
                    "is_postponed": vacation.is_postponed,
                    "postpone_order_number": vacation.postpone_order.order_number if getattr(vacation, "postpone_order", None) else None,
                    "postponed_days": vacation.days_count if vacation.is_postponed else None,
                }
                for vacation in vacations_in_period
            ]

            # Получаем транзакции периода
            from app.schemas.vacation_period import VacationPeriodTransactionResponse
            transactions = await self._repo.get_transactions(db, period.id)
            tx_list = [
                VacationPeriodTransactionResponse.model_validate(tx)
                for tx in transactions
            ]

            # ВАЖНО:
            # remaining_days в этом endpoint используется для карточки периода
            # (блок вида "24+1 | 2 исп. | X") и должен показывать АКТУАЛЬНЫЙ
            # остаток на текущую дату для текущего периода (accrual-to-date).
            # Поэтому для текущего периода используем display_total - used_days.
            # Полный остаток текущего периода (total-used) показывается отдельно:
            # vacations/employees-summary -> current_period_remaining.
            # Расчет remaining_days зависит от статуса периода:
            if period.period_start > today:
                # Будущий период: display_total=0, остаток = 0 - used_days (перерасход)
                # Игнорируем явно установленный remaining_days — период еще не начался
                calculated_remaining = -used_days
            elif period.period_start <= today <= period.period_end:
                # Текущий период: всегда актуальный остаток на сегодня.
                # used_days включает auto+manual, поэтому учитываем все списания.
                calculated_remaining = display_total - used_days
            elif period.remaining_days is not None:
                # Прошлый период с явным remaining (включая ручное закрытие)
                calculated_remaining = period.remaining_days
            else:
                # Прошлый период без явного remaining: display_total - used_days
                calculated_remaining = display_total - used_days

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
                    remaining_days=calculated_remaining,
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

    async def get_effective_vacation_days(self, db: AsyncSession, vacation: Vacation) -> int:
        latest_adjustment = await self._vacation_adjustment_repo.get_latest_by_vacation(db, vacation.id)
        if latest_adjustment:
            return latest_adjustment.actual_days
        return vacation.days_count

    async def _reapply_manual_closures(self, db: AsyncSession, employee_id: int) -> None:
        import logging
        log = logging.getLogger(__name__)
        closures = await self._manual_closure_repo.get_by_employee(db, employee_id)
        log.info(f"_reapply_manual_closures: found {len(closures)} closures for employee {employee_id}")
        for closure in closures:
            period = await self._repo.find_by_work_year(
                db,
                employee_id=employee_id,
                work_year_start=closure.work_year_start,
                work_year_end=closure.work_year_end,
            )
            if not period:
                log.warning(f"Period not found for closure {closure.id}: work_year_start={closure.work_year_start}, work_year_end={closure.work_year_end}")
                continue

            # Восстановление ручного закрытия должно опираться на целевой remaining_days,
            # а не на исторический days_count closure, иначе при пересоздании периодов
            # можно задвоить manual + auto и получить used_days > лимита периода.
            total_days = (period.main_days or 0) + (period.additional_days or 0)
            auto_used = period.used_days_auto or 0
            target_remaining = closure.remaining_days if closure.remaining_days is not None else 0
            target_used_total = max(total_days - target_remaining, 0)
            manual_days_to_apply = max(target_used_total - auto_used, 0)

            # Если auto-списания уже дают целевой остаток, manual транзакция не нужна.
            if manual_days_to_apply <= 0:
                continue

            prev = target_remaining + manual_days_to_apply
            description = f"Восстановлено: Было—{prev} дн., остаток—{target_remaining} дн."

            await self._repo.add_transaction(
                db,
                period_id=period.id,
                days_count=manual_days_to_apply,
                transaction_type=closure.closure_type,
                manual_closure_id=closure.id,
                order_id=closure.order_id,
                description=description,
                created_by=closure.created_by,
                source_type="manual_closure_rebuild",
                metadata={
                    "work_year_start": str(closure.work_year_start),
                    "work_year_end": str(closure.work_year_end),
                    "remaining_days": closure.remaining_days,
                },
                recompute_totals=True,
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
        """Полное закрытие периода — делегирует partial_close с remaining_days=0."""
        return await self.partial_close_period(db, period_id, remaining_days=0)

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

        # Валидация: remaining_days не может быть больше total_days или меньше 0
        if remaining_days < 0:
            raise HTTPException(status_code=400, detail="Остаток дней не может быть отрицательным")
        if remaining_days > total_days:
            raise HTTPException(status_code=400, detail=f"Остаток не может превышать общее количество дней в периоде ({total_days})")

        # Текущий остаток до закрытия — перечитываем period чтобы получить актуальные значения
        await db.refresh(period)
        current_remaining = period.remaining_days if period.remaining_days is not None else total_days - (period.used_days or 0)

        # partial_close может только уменьшать остаток, а не увеличивать
        # Для увеличения остатка нужно отменить ручное закрытие через удаление транзакции
        if remaining_days > current_remaining:
            raise HTTPException(
                status_code=400,
                detail=f"Нельзя установить остаток {remaining_days} — текущий остаток {current_remaining}. Для увеличения остатка отмените закрытие через кнопку ✕"
            )

        # Если период уже закрыт (remaining_days=0) и пытаемся снова закрыть — не создаём дубль
        if remaining_days == 0 and period.remaining_days is not None and period.remaining_days == 0:
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

        effective_auto = period.used_days_auto or 0
        total_used_needed = total_days - remaining_days
        new_manual = total_used_needed - effective_auto

        prev_remaining = period.remaining_days if period.remaining_days is not None else total_days - (period.used_days or 0)

        period.used_days_manual = max(new_manual, 0)
        period.used_days = effective_auto + period.used_days_manual
        period.remaining_days = remaining_days

        if new_manual > 0:
            if remaining_days == 0:
                reason_text = f"Закрытие периода: Было—{prev_remaining} дн., остаток—0 дн."
            else:
                reason_text = f"Было—{prev_remaining} дн., остаток—{remaining_days} дн."

            closure, _ = await self._manual_closure_repo.upsert_for_period(
                db,
                employee_id=period.employee_id,
                work_year_start=period.period_start,
                work_year_end=period.period_end,
                days_count=new_manual,
                closure_type="partial_close",
                remaining_days=remaining_days,
                reason=reason_text,
            )
            # Всегда создаём новую транзакцию — история операций важна.
            # recompute_period_totals берёт последнюю manual транзакцию для used_days_manual.
            await self._repo.add_transaction(
                db,
                period_id=period.id,
                days_count=new_manual,
                transaction_type="partial_close",
                manual_closure_id=closure.id,
                description=reason_text,
            )

        await db.flush()
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

    async def reverse_order_transactions(
        self, db: AsyncSession, employee_id: int, order_id: int
    ) -> None:
        """
        Создаёт reversal-транзакции для всех записей vacation_period_transactions,
        связанных с удаляемым приказом (по original_order_id).
        Затем пересчитывает totals только затронутых периодов.

        Это инкрементальная альтернатива recalculate_periods:
        — не удаляет периоды;
        — не трогает ручные закрытия;
        — не перераспределяет все отпуска с нуля;
        — только отменяет операции конкретного приказа.

        Важно: reversal-транзакции создаются с original_order_id=None,
        чтобы они НЕ были удалены CASCADE при удалении приказа.
        """
        from sqlalchemy import select
        from app.models.vacation_period_transaction import VacationPeriodTransaction

        # Находим все положительные транзакции, связанные с этим приказом
        tx_result = await db.execute(
            select(VacationPeriodTransaction).where(
                VacationPeriodTransaction.original_order_id == order_id,
                VacationPeriodTransaction.days_count > 0,
                VacationPeriodTransaction.is_reversal == False,
            )
        )
        order_transactions = list(tx_result.scalars().all())

        if not order_transactions:
            return

        # Группируем по period_id
        affected_periods: dict[int, int] = {}  # period_id → total days to reverse
        for tx in order_transactions:
            affected_periods[tx.period_id] = affected_periods.get(tx.period_id, 0) + tx.days_count

        # Для каждого периода создаём reversal-транзакцию
        for period_id, days_to_reverse in affected_periods.items():
            # Находим оригинальную транзакцию для ссылки
            first_tx = next(tx for tx in order_transactions if tx.period_id == period_id)

            # original_order_id=None и vacation_id=None чтобы reversal не был удалён CASCADE
            # при удалении приказа (cascade на original_order_id) и отпуска (cascade на vacation_id)
            await self._repo.add_transaction(
                db,
                period_id=period_id,
                days_count=-days_to_reverse,
                transaction_type="vacation_restore",
                order_id=None,
                order_number=first_tx.order_number,
                vacation_id=None,
                original_order_id=None,
                reversed_transaction_id=None,
                is_reversal=True,
                source_type="order_deletion",
                description=f"Восстановление при удалении приказа №{first_tx.order_number or order_id}: {days_to_reverse} дн.",
                recompute_totals=True,
            )

    async def get_affected_period_ids_for_order(
        self,
        db: AsyncSession,
        order_id: int,
    ) -> list[int]:
        """Возвращает period_id, в которых есть операции, каскадно удаляемые с приказом."""
        from sqlalchemy import distinct, or_
        from app.models.vacation_period_transaction import VacationPeriodTransaction

        result = await db.execute(
            select(distinct(VacationPeriodTransaction.period_id)).where(
                or_(
                    VacationPeriodTransaction.original_order_id == order_id,
                    VacationPeriodTransaction.adjustment_order_id == order_id,
                )
            )
        )
        return [row[0] for row in result.all() if row[0] is not None]

    async def recompute_period_totals_by_ids(self, db: AsyncSession, period_ids: list[int]) -> None:
        for period_id in sorted(set(period_ids)):
            await self._repo.recompute_period_totals(db, period_id)

    async def recalculate_vacation_days_only(self, db: AsyncSession, employee_id: int) -> list[VacationPeriodBalance]:
        """Пересчитать автоматические списания без удаления периодов и ручных закрытий."""
        from app.repositories.employee_repository import EmployeeRepository
        from app.repositories.order_repository import OrderRepository

        employee = await EmployeeRepository().get_by_id(db, employee_id)
        if not employee or not employee.hire_date:
            raise HTTPException(status_code=400, detail="У сотрудника не указана дата приёма")

        await self._repo.delete_auto_transactions_for_employee(db, employee_id)

        result = await db.execute(
            select(Vacation)
            .where(
                Vacation.employee_id == employee_id,
                Vacation.is_deleted == False,
                Vacation.is_cancelled == False,
                Vacation.order_id.isnot(None),
            )
            .order_by(Vacation.start_date.asc(), Vacation.id.asc())
        )
        vacations = list(result.scalars().all())
        order_repo = OrderRepository()

        for vacation in vacations:
            days_to_use = await self.get_effective_vacation_days(db, vacation)
            if days_to_use <= 0:
                continue
            order = await order_repo.get_by_id(db, vacation.order_id)
            order_number = order.order_number if order else None
            await auto_use_days(
                db=db,
                employee_id=employee_id,
                days_to_use=days_to_use,
                hire_date=employee.hire_date,
                additional_days=employee.additional_vacation_days or 0,
                order_id=vacation.order_id,
                order_number=order_number,
                vacation_id=vacation.id,
                transaction_type="recalculate_use",
                original_order_id=vacation.order_id,
                is_recalc=True,
            )

        await db.commit()
        return await self.get_employee_periods(db, employee_id)

    async def recalculate_periods(self, db: AsyncSession, employee_id: int) -> list[VacationPeriodBalance]:
        """Пересоздать последнюю серию периодов и заново распределить дни отпусков по порядку."""
        from app.repositories.employee_repository import EmployeeRepository
        from app.repositories.order_repository import OrderRepository

        employee_repo = EmployeeRepository()
        employee = await employee_repo.get_by_id(db, employee_id)
        if not employee or not employee.hire_date:
            raise HTTPException(status_code=400, detail="У сотрудника не указана дата приёма")

        # Получаем границы серий
        boundaries = await self._get_series_boundaries(db, employee_id, employee.hire_date)

        if len(boundaries) > 1:
            # Удаляем только периоды последней серии
            latest_boundary = boundaries[-1]
            all_periods = await self._repo.get_by_employee(db, employee_id)
            latest_period_ids = [p.id for p in all_periods if p.period_start >= latest_boundary]
            await self._repo.delete_by_ids(db, latest_period_ids)
        else:
            # Нет корректировок — удаляем все периоды как раньше
            await self._repo.delete_all_by_employee(db, employee_id)

        # Создаём периоды заново (все серии кроме последней уже сохранены)
        await self.ensure_periods_for_employee(
            db,
            employee_id,
            employee.hire_date,
            employee.additional_vacation_days or 0,
        )

        await self._repo.delete_auto_transactions_for_employee(db, employee_id)
        await self._repo.delete_manual_transactions_for_employee(db, employee_id)

        # Получаем все отпуска сотрудника (не удалённые, не отменённые, с приказом)
        result = await db.execute(
            select(Vacation)
            .where(
                Vacation.employee_id == employee_id,
                Vacation.is_deleted == False,
                Vacation.is_cancelled == False,
                Vacation.order_id.isnot(None),
            )
            .order_by(Vacation.start_date.asc(), Vacation.id.asc())
        )
        vacations = list(result.scalars().all())
        order_repo = OrderRepository()

        # По порядку от самого старого отпуска распределяем дни по периодам
        for vacation in vacations:
            days_to_use = await self.get_effective_vacation_days(db, vacation)
            if days_to_use <= 0:
                continue

            order = await order_repo.get_by_id(db, vacation.order_id)
            order_number = order.order_number if order else None

            await auto_use_days(
                db,
                employee_id=employee_id,
                days_to_use=days_to_use,
                hire_date=employee.hire_date,
                additional_days=employee.additional_vacation_days or 0,
                order_id=vacation.order_id,
                order_number=order_number,
                vacation_id=vacation.id,
                transaction_type="recalculate_use",
                original_order_id=vacation.order_id,
                is_recalc=True,
            )

        await self._reapply_manual_closures(db, employee_id)

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
    vacation_id: int = None,
    transaction_type: str = "vacation_use",
    original_order_id: int = None,
    adjustment_order_id: int = None,
    adjustment_id: int = None,
    is_recalc: bool = False,
) -> None:
    from dateutil.relativedelta import relativedelta

    repo = VacationPeriodRepository()
    result = await db.execute(
        select(VacationPeriod)
        .where(VacationPeriod.employee_id == employee_id)
        .order_by(VacationPeriod.period_start.asc())
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
            order_label = order_number or "без номера"
            desc = f"Автосписание по приказу №{order_label}: {days_to_take} дней"
            if is_recalc:
                desc += " (Перезаписан)"
            await repo.add_transaction(
                db,
                period_id=period.id,
                days_count=days_to_take,
                transaction_type=transaction_type,
                order_id=order_id,
                order_number=order_number,
                vacation_id=vacation_id,
                original_order_id=original_order_id,
                adjustment_order_id=adjustment_order_id,
                adjustment_id=adjustment_id,
                source_type="vacation",
                metadata={"is_recalc": is_recalc} if is_recalc else None,
                description=desc,
                recompute_totals=True,
            )
            remaining_to_use -= days_to_take

    # Если остались непокрытые дни — создаём будущие периоды от последней серии
    # Определяем последнюю границу серии
    from app.repositories.hire_date_adjustment_repository import HireDateAdjustmentRepository
    adjustment_repo = HireDateAdjustmentRepository()
    latest_adj = await adjustment_repo.get_latest(db, employee_id)
    effective_start = latest_adj.adjustment_date if latest_adj else hire_date

    while remaining_to_use > 0 and effective_start is not None:
        last_year = max((p.year_number for p in periods_sorted), default=0)
        next_year = last_year + 1

        period_start = effective_start + relativedelta(months=12 * (next_year - 1))
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
        order_label = order_number or "без номера"
        desc = f"Автосписание по приказу №{order_label}: {days_to_take} дней (будущий период)"
        if is_recalc:
            desc += " (Перезаписан)"
        await repo.add_transaction(
            db,
            period_id=new_period.id,
            days_count=days_to_take,
            transaction_type=transaction_type,
            order_id=order_id,
            order_number=order_number,
            vacation_id=vacation_id,
            original_order_id=original_order_id,
            adjustment_order_id=adjustment_order_id,
            adjustment_id=adjustment_id,
            source_type="vacation",
            metadata={"is_recalc": is_recalc} if is_recalc else None,
            description=desc,
            recompute_totals=True,
        )
        remaining_to_use -= days_to_take


vacation_period_service = VacationPeriodService()
