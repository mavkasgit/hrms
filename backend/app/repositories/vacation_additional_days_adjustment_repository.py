from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vacation_additional_days_adjustment import VacationAdditionalDaysAdjustment


class VacationAdditionalDaysAdjustmentRepository:
    async def create(self, db: AsyncSession, data: dict) -> VacationAdditionalDaysAdjustment:
        adjustment = VacationAdditionalDaysAdjustment(**data)
        db.add(adjustment)
        await db.flush()
        await db.refresh(adjustment)
        return adjustment

    async def get_by_employee(self, db: AsyncSession, employee_id: int) -> list[VacationAdditionalDaysAdjustment]:
        """История изменений: новые → старые."""
        result = await db.execute(
            select(VacationAdditionalDaysAdjustment)
            .where(VacationAdditionalDaysAdjustment.employee_id == employee_id)
            .order_by(VacationAdditionalDaysAdjustment.created_at.desc(), VacationAdditionalDaysAdjustment.id.desc())
        )
        return list(result.scalars().all())

    async def get_latest(self, db: AsyncSession, employee_id: int) -> Optional[VacationAdditionalDaysAdjustment]:
        """Последняя ДИАПАЗОННАЯ запись — задаёт границу синхронизации (effective_from).

        Точечные правки (is_period_edit=True) границу не двигают и игнорируются.
        """
        result = await db.execute(
            select(VacationAdditionalDaysAdjustment)
            .where(
                VacationAdditionalDaysAdjustment.employee_id == employee_id,
                VacationAdditionalDaysAdjustment.is_period_edit == False,
            )
            .order_by(VacationAdditionalDaysAdjustment.created_at.desc(), VacationAdditionalDaysAdjustment.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()


vacation_additional_days_adjustment_repository = VacationAdditionalDaysAdjustmentRepository()