from datetime import date
from typing import Optional, List, Tuple

from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.work_schedule import WorkSchedule, WorkScheduleEntry


class WorkScheduleRepository:
    """Репозиторий плановых графиков работы."""

    async def get_by_id(
        self, db: AsyncSession, schedule_id: int, with_entries: bool = False
    ) -> Optional[WorkSchedule]:
        stmt = select(WorkSchedule).where(WorkSchedule.id == schedule_id)
        if with_entries:
            stmt = stmt.options(selectinload(WorkSchedule.entries))
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_employee_period(
        self, db: AsyncSession, employee_id: int, year: int, month: int, with_entries: bool = False
    ) -> Optional[WorkSchedule]:
        stmt = select(WorkSchedule).where(
            and_(
                WorkSchedule.employee_id == employee_id,
                WorkSchedule.year == year,
                WorkSchedule.month == month,
            )
        )
        if with_entries:
            stmt = stmt.options(selectinload(WorkSchedule.entries))
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_period(
        self, db: AsyncSession, year: int, month: int, with_entries: bool = False
    ) -> List[WorkSchedule]:
        stmt = (
            select(WorkSchedule)
            .where(and_(WorkSchedule.year == year, WorkSchedule.month == month))
            .order_by(WorkSchedule.employee_id)
        )
        if with_entries:
            stmt = stmt.options(selectinload(WorkSchedule.entries))
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_employee_year(
        self, db: AsyncSession, employee_id: int, year: int, with_entries: bool = False
    ) -> List[WorkSchedule]:
        stmt = (
            select(WorkSchedule)
            .where(and_(WorkSchedule.employee_id == employee_id, WorkSchedule.year == year))
            .order_by(WorkSchedule.month)
        )
        if with_entries:
            stmt = stmt.options(selectinload(WorkSchedule.entries))
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, db: AsyncSession, data: dict) -> WorkSchedule:
        schedule = WorkSchedule(**data)
        db.add(schedule)
        await db.flush()
        await db.refresh(schedule)
        return schedule

    async def update(
        self, db: AsyncSession, schedule: WorkSchedule, data: dict
    ) -> WorkSchedule:
        for key, value in data.items():
            if value is not None:
                setattr(schedule, key, value)
        schedule.updated_at = date.today()
        await db.flush()
        await db.refresh(schedule)
        return schedule

    async def delete(self, db: AsyncSession, schedule: WorkSchedule) -> None:
        await db.delete(schedule)
        await db.flush()

    # --- Entries ---

    async def add_entry(self, db: AsyncSession, schedule_id: int, data: dict) -> WorkScheduleEntry:
        entry = WorkScheduleEntry(schedule_id=schedule_id, **data)
        db.add(entry)
        await db.flush()
        await db.refresh(entry)
        return entry

    async def update_entry(
        self, db: AsyncSession, entry: WorkScheduleEntry, data: dict
    ) -> WorkScheduleEntry:
        for key, value in data.items():
            setattr(entry, key, value)
        await db.flush()
        await db.refresh(entry)
        return entry

    async def get_entry_by_date(
        self, db: AsyncSession, schedule_id: int, work_date: date
    ) -> Optional[WorkScheduleEntry]:
        result = await db.execute(
            select(WorkScheduleEntry).where(
                and_(
                    WorkScheduleEntry.schedule_id == schedule_id,
                    WorkScheduleEntry.work_date == work_date,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_entry_by_id(
        self, db: AsyncSession, entry_id: int
    ) -> Optional[WorkScheduleEntry]:
        result = await db.execute(
            select(WorkScheduleEntry).where(WorkScheduleEntry.id == entry_id)
        )
        return result.scalar_one_or_none()

    async def delete_entry(self, db: AsyncSession, entry: WorkScheduleEntry) -> None:
        await db.delete(entry)
        await db.flush()

    async def replace_entries(
        self,
        db: AsyncSession,
        schedule_id: int,
        entries_data: List[dict],
    ) -> List[WorkScheduleEntry]:
        """Полностью заменяет все записи графика на новые (upsert по дате)."""
        # Удаляем старые
        await db.execute(
            delete(WorkScheduleEntry).where(WorkScheduleEntry.schedule_id == schedule_id)
        )
        await db.flush()
        # Вставляем новые
        result_entries: List[WorkScheduleEntry] = []
        for entry_data in entries_data:
            entry = WorkScheduleEntry(schedule_id=schedule_id, **entry_data)
            db.add(entry)
            result_entries.append(entry)
        await db.flush()
        for entry in result_entries:
            await db.refresh(entry)
        return result_entries


work_schedule_repository = WorkScheduleRepository()
