from datetime import date
from typing import Optional, List, Tuple

from sqlalchemy import select, and_, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.timesheet import TimesheetImport, TimesheetEntry, TimesheetUnmatchedRow


class TimesheetImportRepository:
    """Репозиторий загрузок турникетного журнала."""

    async def get_by_id(
        self, db: AsyncSession, import_id: int, with_entries: bool = False
    ) -> Optional[TimesheetImport]:
        stmt = select(TimesheetImport).where(TimesheetImport.id == import_id)
        if with_entries:
            stmt = stmt.options(
                selectinload(TimesheetImport.entries),
                selectinload(TimesheetImport.unmatched_rows),
            )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all(
        self,
        db: AsyncSession,
        limit: int = 50,
        offset: int = 0,
        period_start: Optional[date] = None,
        period_end: Optional[date] = None,
    ) -> Tuple[List[TimesheetImport], int]:
        stmt = select(TimesheetImport).order_by(TimesheetImport.uploaded_at.desc())
        count_stmt = select(func.count()).select_from(TimesheetImport)

        if period_start:
            stmt = stmt.where(TimesheetImport.period_end >= period_start)
            count_stmt = count_stmt.where(TimesheetImport.period_end >= period_start)
        if period_end:
            stmt = stmt.where(TimesheetImport.period_start <= period_end)
            count_stmt = count_stmt.where(TimesheetImport.period_start <= period_end)

        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset(offset).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all()), int(total)

    async def create(self, db: AsyncSession, data: dict) -> TimesheetImport:
        record = TimesheetImport(**data)
        db.add(record)
        await db.flush()
        await db.refresh(record)
        return record

    async def update(
        self, db: AsyncSession, record: TimesheetImport, data: dict
    ) -> TimesheetImport:
        for key, value in data.items():
            if value is not None:
                setattr(record, key, value)
        await db.flush()
        await db.refresh(record)
        return record

    async def delete(self, db: AsyncSession, record: TimesheetImport) -> None:
        await db.delete(record)
        await db.flush()


class TimesheetEntryRepository:
    """Репозиторий дневных записей факта."""

    async def get_by_id(
        self, db: AsyncSession, entry_id: int
    ) -> Optional[TimesheetEntry]:
        result = await db.execute(
            select(TimesheetEntry).where(TimesheetEntry.id == entry_id)
        )
        return result.scalar_one_or_none()

    async def get_by_employee_period(
        self,
        db: AsyncSession,
        employee_id: int,
        period_start: date,
        period_end: date,
    ) -> List[TimesheetEntry]:
        """Возвращает все фактические записи сотрудника за период
        (берётся самый поздний импорт для каждой даты)."""
        # Подзапрос: максимальный import_id для каждой даты
        max_import_subq = (
            select(
                TimesheetEntry.work_date.label("work_date"),
                func.max(TimesheetEntry.import_id).label("max_import_id"),
            )
            .where(
                and_(
                    TimesheetEntry.employee_id == employee_id,
                    TimesheetEntry.work_date >= period_start,
                    TimesheetEntry.work_date <= period_end,
                )
            )
            .group_by(TimesheetEntry.work_date)
            .subquery()
        )

        stmt = (
            select(TimesheetEntry)
            .join(
                max_import_subq,
                and_(
                    TimesheetEntry.work_date == max_import_subq.c.work_date,
                    TimesheetEntry.import_id == max_import_subq.c.max_import_id,
                ),
            )
            .where(TimesheetEntry.employee_id == employee_id)
            .order_by(TimesheetEntry.work_date)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_period(
        self,
        db: AsyncSession,
        period_start: date,
        period_end: date,
        employee_ids: Optional[List[int]] = None,
    ) -> List[TimesheetEntry]:
        """Возвращает все фактические записи за период (последний импорт)."""
        max_import_subq = (
            select(
                TimesheetEntry.work_date.label("work_date"),
                TimesheetEntry.employee_id.label("employee_id"),
                func.max(TimesheetEntry.import_id).label("max_import_id"),
            )
            .where(
                and_(
                    TimesheetEntry.work_date >= period_start,
                    TimesheetEntry.work_date <= period_end,
                )
            )
            .group_by(TimesheetEntry.work_date, TimesheetEntry.employee_id)
            .subquery()
        )

        stmt = (
            select(TimesheetEntry)
            .join(
                max_import_subq,
                and_(
                    TimesheetEntry.work_date == max_import_subq.c.work_date,
                    TimesheetEntry.employee_id == max_import_subq.c.employee_id,
                    TimesheetEntry.import_id == max_import_subq.c.max_import_id,
                ),
            )
            .order_by(TimesheetEntry.employee_id, TimesheetEntry.work_date)
        )
        if employee_ids is not None:
            stmt = stmt.where(TimesheetEntry.employee_id.in_(employee_ids))
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def bulk_create(self, db: AsyncSession, entries_data: List[dict]) -> List[TimesheetEntry]:
        entries = [TimesheetEntry(**data) for data in entries_data]
        db.add_all(entries)
        await db.flush()
        for e in entries:
            await db.refresh(e)
        return entries

    async def delete_by_import(self, db: AsyncSession, import_id: int) -> int:
        result = await db.execute(
            select(TimesheetEntry).where(TimesheetEntry.import_id == import_id)
        )
        items = result.scalars().all()
        count = 0
        for item in items:
            await db.delete(item)
            count += 1
        await db.flush()
        return count


class TimesheetUnmatchedRowRepository:
    """Репозиторий несопоставленных строк."""

    async def get_by_import(self, db: AsyncSession, import_id: int) -> List[TimesheetUnmatchedRow]:
        result = await db.execute(
            select(TimesheetUnmatchedRow)
            .where(TimesheetUnmatchedRow.import_id == import_id)
            .order_by(TimesheetUnmatchedRow.last_name, TimesheetUnmatchedRow.first_name)
        )
        return list(result.scalars().all())

    async def get_by_id(
        self, db: AsyncSession, row_id: int
    ) -> Optional[TimesheetUnmatchedRow]:
        result = await db.execute(
            select(TimesheetUnmatchedRow).where(TimesheetUnmatchedRow.id == row_id)
        )
        return result.scalar_one_or_none()

    async def bulk_create(
        self, db: AsyncSession, rows_data: List[dict]
    ) -> List[TimesheetUnmatchedRow]:
        rows = [TimesheetUnmatchedRow(**data) for data in rows_data]
        db.add_all(rows)
        await db.flush()
        for r in rows:
            await db.refresh(r)
        return rows

    async def update(
        self, db: AsyncSession, row: TimesheetUnmatchedRow, data: dict
    ) -> TimesheetUnmatchedRow:
        for key, value in data.items():
            setattr(row, key, value)
        await db.flush()
        await db.refresh(row)
        return row

    async def delete(self, db: AsyncSession, row: TimesheetUnmatchedRow) -> None:
        await db.delete(row)
        await db.flush()


timesheet_import_repository = TimesheetImportRepository()
timesheet_entry_repository = TimesheetEntryRepository()
timesheet_unmatched_repository = TimesheetUnmatchedRowRepository()
