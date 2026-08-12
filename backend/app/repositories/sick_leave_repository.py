from datetime import date, datetime, time
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import select, func, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sick_leave import SickLeave, SickLeaveStatus
from app.models.employee import Employee
from app.models.department import Department


def _count_unique_days(intervals: List[Tuple[date, date]]) -> int:
    """Количество уникальных дней по списку периодов (склейка пересекающихся)."""
    if not intervals:
        return 0

    intervals = sorted(intervals)
    total = 0
    current_start, current_end = intervals[0]
    for start, end in intervals[1:]:
        if start <= current_end:
            if end > current_end:
                current_end = end
        else:
            total += (current_end - current_start).days + 1
            current_start, current_end = start, end
    total += (current_end - current_start).days + 1
    return total


class SickLeaveRepository:
    """Репозиторий для работы с больничными листами."""

    async def create(self, db: AsyncSession, sick_leave: SickLeave) -> SickLeave:
        """Создать запись о больничном."""
        db.add(sick_leave)
        await db.commit()
        await db.refresh(sick_leave)
        return sick_leave

    async def get_by_id(
        self, db: AsyncSession, sick_leave_id: int
    ) -> Optional[SickLeave]:
        """Получить больничный по ID."""
        query = select(SickLeave).where(
            SickLeave.id == sick_leave_id, SickLeave.status != SickLeaveStatus.DELETED
        )
        result = await db.execute(query)
        return result.scalars().first()

    async def get_all(
        self,
        db: AsyncSession,
        search_query: Optional[str] = None,
        status: Optional[SickLeaveStatus] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[SickLeave], int]:
        """
        Получить список больничных с фильтрацией и пагинацией.
        Возвращает кортеж (список записей, общее количество).
        """
        query = (
            select(SickLeave)
            .join(Employee)
            .where(SickLeave.status != SickLeaveStatus.DELETED)
        )

        if search_query:
            search_pattern = f"%{search_query}%"
            query = query.where(Employee.name.ilike(search_pattern))

        if status:
            query = query.where(SickLeave.status == status)

        # Общее количество для пагинации
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        # Пагинация
        offset = (page - 1) * per_page
        query = query.order_by(SickLeave.start_date.desc(), SickLeave.id.desc())
        query = query.offset(offset).limit(per_page)

        result = await db.execute(query)
        items = result.scalars().all()

        return list(items), total

    async def get_by_employee_id(
        self, db: AsyncSession, employee_id: int, year: Optional[int] = None
    ) -> List[SickLeave]:
        """Получить все больничные сотрудника за год (активные и отмененные)."""
        query = select(SickLeave).where(
            SickLeave.employee_id == employee_id,
            SickLeave.status != SickLeaveStatus.DELETED,
        )

        if year:
            query = query.where(func.extract("year", SickLeave.start_date) == year)

        query = query.order_by(SickLeave.start_date.desc())
        result = await db.execute(query)
        return list(result.scalars().all())

    async def update(
        self, db: AsyncSession, sick_leave: SickLeave, update_data: dict
    ) -> SickLeave:
        """Обновить запись о больничном."""
        for field, value in update_data.items():
            if hasattr(sick_leave, field) and value is not None:
                setattr(sick_leave, field, value)

        sick_leave.updated_at = datetime.combine(date.today(), time.min)
        await db.commit()
        await db.refresh(sick_leave)
        return sick_leave

    async def soft_delete(
        self,
        db: AsyncSession,
        sick_leave: SickLeave,
        current_user: str,
    ) -> bool:
        """Мягкое удаление больничного (установка статуса DELETED)."""
        sick_leave.status = SickLeaveStatus.DELETED
        sick_leave.deleted_by = current_user
        await db.commit()
        return True

    async def check_overlap(
        self,
        db: AsyncSession,
        employee_id: int,
        start_date: date,
        end_date: date,
        exclude_id: Optional[int] = None,
    ) -> Optional[SickLeave]:
        """
        Проверить пересечение с активными больничными.

        Строгое условие: пересечением считаются только периоды с реальной
        общей внутренней частью. Соседние периоды (конец одного == начало
        другого) и однодневный больничный на границе не пересекаются.
        Условие пересечения: (StartA < EndB) и (EndA > StartB)
        """
        query = select(SickLeave).where(
            SickLeave.employee_id == employee_id,
            SickLeave.status == SickLeaveStatus.ACTIVE,
            SickLeave.start_date < end_date,
            SickLeave.end_date > start_date,
        )

        if exclude_id:
            query = query.where(SickLeave.id != exclude_id)

        result = await db.execute(query)
        return result.scalars().first()

    async def get_total_sick_days(
        self, db: AsyncSession, employee_id: int, year: int
    ) -> int:
        """Количество уникальных дней больничных за год (только активные).

        День, принадлежащий двум больничным, считается один раз.
        """
        query = select(SickLeave).where(
            SickLeave.employee_id == employee_id,
            SickLeave.status == SickLeaveStatus.ACTIVE,
            func.extract("year", SickLeave.start_date) == year,
        )

        result = await db.execute(query)
        leaves = list(result.scalars().all())
        return _count_unique_days([(sl.start_date, sl.end_date) for sl in leaves])

    async def get_employees_summary(
        self,
        db: AsyncSession,
        search_query: Optional[str] = None,
        include_archived: bool = False,
    ) -> List[dict]:
        """
        Получить сводку по больничным для всех сотрудников.

        Возвращает список словарей с информацией о сотруднике и статистике.
        total_sick_days — уникальные дни (день, принадлежащий двум больничным,
        считается один раз).
        """
        query = (
            select(
                Employee.id,
                Employee.name,
                Employee.tab_number,
                Department.name.label("department"),
                SickLeave.start_date,
                SickLeave.end_date,
            )
            .outerjoin(
                SickLeave,
                (SickLeave.employee_id == Employee.id)
                & (SickLeave.status == SickLeaveStatus.ACTIVE),
            )
            .outerjoin(Department, Employee.department_id == Department.id)
            .where(Employee.is_deleted == False)
        )

        if not include_archived:
            query = query.where(Employee.is_dismissed == False)

        if search_query:
            query = query.where(
                (Employee.name.ilike(f"%{search_query}%"))
                | (Employee.tab_number.cast(String).ilike(f"%{search_query}%"))
            )

        query = query.order_by(Employee.name, SickLeave.start_date)

        result = await db.execute(query)
        rows = result.fetchall()

        by_employee: Dict[int, Dict[str, Any]] = {}
        for row in rows:
            entry = by_employee.setdefault(
                row.id,
                {
                    "employee_id": row.id,
                    "employee_name": row.name,
                    "tab_number": row.tab_number,
                    "department": row.department,
                    "total_sick_days": 0,
                    "sick_leaves_count": 0,
                    "_intervals": [],
                },
            )
            if row.start_date is not None:
                entry["sick_leaves_count"] += 1
                entry["_intervals"].append((row.start_date, row.end_date))

        summary: List[Dict[str, Any]] = []
        for entry in by_employee.values():
            intervals = entry.pop("_intervals")
            entry["total_sick_days"] = _count_unique_days(intervals)
            summary.append(entry)

        summary.sort(key=lambda e: e["employee_name"])
        return summary
