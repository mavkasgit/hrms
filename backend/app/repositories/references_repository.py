from datetime import date
from typing import Optional

from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.references import PositionVacationConfig, Holiday, get_default_holidays


class ReferencesRepository:
    async def get_position_config(self, db: AsyncSession, position: str) -> Optional[PositionVacationConfig]:
        result = await db.execute(
            select(PositionVacationConfig).where(PositionVacationConfig.position == position)
        )
        return result.scalar_one_or_none()

    async def get_all_position_configs(self, db: AsyncSession) -> list[PositionVacationConfig]:
        result = await db.execute(
            select(PositionVacationConfig).order_by(PositionVacationConfig.position)
        )
        return list(result.scalars().all())

    async def upsert_position_config(self, db: AsyncSession, position: str, days: int) -> PositionVacationConfig:
        existing = await self.get_position_config(db, position)
        if existing:
            existing.days = days
            await db.flush()
            await db.refresh(existing)
            return existing
        config = PositionVacationConfig(position=position, days=days)
        db.add(config)
        await db.flush()
        await db.refresh(config)
        return config

    async def delete_position_config(self, db: AsyncSession, position: str) -> bool:
        existing = await self.get_position_config(db, position)
        if not existing:
            return False
        await db.execute(sa_delete(PositionVacationConfig).where(PositionVacationConfig.position == position))
        await db.flush()
        return True

    async def get_holidays(self, db: AsyncSession, year: Optional[int] = None) -> list[Holiday]:
        query = select(Holiday).order_by(Holiday.date)
        if year is not None:
            query = query.where(Holiday.year == year)
        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_holidays_for_year(self, db: AsyncSession, year: int) -> list[date]:
        """Возвращает только даты праздников за год"""
        query = select(Holiday.date).where(Holiday.year == year)
        result = await db.execute(query)
        return list(result.scalars().all())

    async def add_holiday(self, db: AsyncSession, date_val: date, name: str) -> Holiday:
        holiday = Holiday(date=date_val, name=name, year=date_val.year)
        db.add(holiday)
        await db.flush()
        await db.refresh(holiday)
        return holiday

    async def delete_holiday(self, db: AsyncSession, id: int) -> bool:
        result = await db.execute(
            sa_delete(Holiday).where(Holiday.id == id).returning(Holiday.id)
        )
        deleted = result.scalar_one_or_none()
        if deleted:
            await db.flush()
        return deleted is not None

    async def seed_holidays_for_year(self, db: AsyncSession, year: int) -> int:
        """Добавляет стандартные праздники РБ для указанного года. Возвращает количество добавленных."""
        existing_dates = await self.get_holidays_for_year(db, year)
        defaults = get_default_holidays(year)
        added = 0
        for item in defaults:
            d = date.fromisoformat(item["date"])
            if d not in existing_dates:
                holiday = Holiday(date=d, name=item["name"], year=year)
                db.add(holiday)
                added += 1
        if added > 0:
            await db.flush()
        return added


references_repository = ReferencesRepository()
