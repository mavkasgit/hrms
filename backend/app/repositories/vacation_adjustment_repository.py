from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vacation_adjustment import VacationAdjustment


class VacationAdjustmentRepository:
    async def create(self, db: AsyncSession, data: dict) -> VacationAdjustment:
        adjustment = VacationAdjustment(**data)
        db.add(adjustment)
        await db.flush()
        await db.refresh(adjustment)
        return adjustment

    async def get_latest_by_vacation(self, db: AsyncSession, vacation_id: int) -> VacationAdjustment | None:
        result = await db.execute(
            select(VacationAdjustment)
            .where(VacationAdjustment.vacation_id == vacation_id)
            .order_by(VacationAdjustment.created_at.desc(), VacationAdjustment.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_by_vacation_and_order(
        self,
        db: AsyncSession,
        vacation_id: int,
        adjustment_order_id: int,
    ) -> VacationAdjustment | None:
        result = await db.execute(
            select(VacationAdjustment).where(
                VacationAdjustment.vacation_id == vacation_id,
                VacationAdjustment.adjustment_order_id == adjustment_order_id,
            )
        )
        return result.scalar_one_or_none()


vacation_adjustment_repository = VacationAdjustmentRepository()
