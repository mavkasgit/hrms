from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vacation_plan import VacationPlan


class VacationPlanRepository:
    async def create_or_update(self, db: AsyncSession, data: dict) -> VacationPlan:
        existing = await self.get_by_employee_year_month(
            db, data["employee_id"], data["year"], data["month"]
        )
        if existing:
            for key, value in data.items():
                if key not in ("employee_id", "year", "month"):
                    setattr(existing, key, value)
            await db.flush()
            await db.refresh(existing)
            return existing
        else:
            plan = VacationPlan(**data)
            db.add(plan)
            await db.flush()
            await db.refresh(plan)
            return plan

    async def get_by_id(self, db: AsyncSession, plan_id: int) -> Optional[VacationPlan]:
        result = await db.execute(
            select(VacationPlan).where(VacationPlan.id == plan_id)
        )
        return result.scalar_one_or_none()

    async def get_by_employee_year_month(
        self, db: AsyncSession, employee_id: int, year: int, month: int
    ) -> Optional[VacationPlan]:
        result = await db.execute(
            select(VacationPlan).where(
                and_(
                    VacationPlan.employee_id == employee_id,
                    VacationPlan.year == year,
                    VacationPlan.month == month,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_by_year(self, db: AsyncSession, year: int) -> list[VacationPlan]:
        result = await db.execute(
            select(VacationPlan)
            .where(VacationPlan.year == year)
            .order_by(VacationPlan.employee_id, VacationPlan.month)
        )
        return list(result.scalars().all())

    async def get_by_employee_and_year(
        self, db: AsyncSession, employee_id: int, year: int
    ) -> list[VacationPlan]:
        result = await db.execute(
            select(VacationPlan)
            .where(
                and_(
                    VacationPlan.employee_id == employee_id,
                    VacationPlan.year == year,
                )
            )
            .order_by(VacationPlan.month)
        )
        return list(result.scalars().all())

    async def delete(self, db: AsyncSession, plan_id: int) -> bool:
        plan = await self.get_by_id(db, plan_id)
        if not plan:
            return False
        await db.delete(plan)
        await db.flush()
        return True
