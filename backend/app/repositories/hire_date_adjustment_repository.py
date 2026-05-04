from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hire_date_adjustment import HireDateAdjustment


class HireDateAdjustmentRepository:
    async def create(self, db: AsyncSession, data: dict) -> HireDateAdjustment:
        adjustment = HireDateAdjustment(**data)
        db.add(adjustment)
        await db.flush()
        await db.refresh(adjustment)
        return adjustment

    async def get_by_employee(self, db: AsyncSession, employee_id: int) -> list[HireDateAdjustment]:
        result = await db.execute(
            select(HireDateAdjustment)
            .where(HireDateAdjustment.employee_id == employee_id)
            .order_by(HireDateAdjustment.adjustment_date.asc())
        )
        return list(result.scalars().all())

    async def get_latest(self, db: AsyncSession, employee_id: int) -> Optional[HireDateAdjustment]:
        result = await db.execute(
            select(HireDateAdjustment)
            .where(HireDateAdjustment.employee_id == employee_id)
            .order_by(HireDateAdjustment.adjustment_date.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
