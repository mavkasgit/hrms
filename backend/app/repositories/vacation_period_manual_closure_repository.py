from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vacation_period_manual_closure import VacationPeriodManualClosure


class VacationPeriodManualClosureRepository:
    async def get_by_employee(self, db: AsyncSession, employee_id: int) -> list[VacationPeriodManualClosure]:
        result = await db.execute(
            select(VacationPeriodManualClosure)
            .where(VacationPeriodManualClosure.employee_id == employee_id)
            .order_by(VacationPeriodManualClosure.work_year_start.asc())
        )
        return list(result.scalars().all())

    async def upsert_for_period(
        self,
        db: AsyncSession,
        *,
        employee_id: int,
        work_year_start,
        work_year_end,
        days_count: int,
        closure_type: str,
        remaining_days: int | None = None,
        order_id: int | None = None,
        reason: str | None = None,
        created_by: str | None = None,
    ) -> VacationPeriodManualClosure:
        result = await db.execute(
            select(VacationPeriodManualClosure).where(
                VacationPeriodManualClosure.employee_id == employee_id,
                VacationPeriodManualClosure.work_year_start == work_year_start,
                VacationPeriodManualClosure.work_year_end == work_year_end,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.days_count = days_count
            existing.closure_type = closure_type
            existing.remaining_days = remaining_days
            existing.order_id = order_id
            existing.reason = reason
            if created_by:
                existing.created_by = created_by
            await db.flush()
            await db.refresh(existing)
            return existing

        closure = VacationPeriodManualClosure(
            employee_id=employee_id,
            work_year_start=work_year_start,
            work_year_end=work_year_end,
            days_count=days_count,
            closure_type=closure_type,
            remaining_days=remaining_days,
            order_id=order_id,
            reason=reason,
            created_by=created_by,
        )
        db.add(closure)
        await db.flush()
        await db.refresh(closure)
        return closure


vacation_period_manual_closure_repository = VacationPeriodManualClosureRepository()
