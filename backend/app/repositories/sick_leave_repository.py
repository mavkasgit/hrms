from datetime import date
from typing import Optional, List, Tuple
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sick_leave import SickLeave, SickLeaveStatus
from app.models.employee import Employee
from app.models.department import Department


class SickLeaveRepository:
    """Репозиторий для работы с больничными листами."""

    async def create(self, db: AsyncSession, sick_leave: SickLeave) -> SickLeave:
        """Создать запись о больничном."""
        db.add(sick_leave)
        await db.commit()
        await db.refresh(sick_leave)
        return sick_leave

    async def get_by_id(self, db: AsyncSession, sick_leave_id: int) -> Optional[SickLeave]:
        """Получить больничный по ID."""
        query = select(SickLeave).where(
            SickLeave.id == sick_leave_id,
            SickLeave.status != SickLeaveStatus.DELETED
        )
        result = await db.execute(query)
        return result.scalars().first()

    async def get_all(
        self,
        db: AsyncSession,
        employee_id: Optional[int] = None,
        year: Optional[int] = None,
        sick_leave_type: Optional[str] = None,
        status: Optional[SickLeaveStatus] = None,
        page: int = 1,
        per_page: int = 20
    ) -> Tuple[List[SickLeave], int]:
        """
        Получить список больничных с фильтрацией и пагинацией.
        Возвращает кортеж (список записей, общее количество).
        """
        query = select(SickLeave).join(Employee).where(
            SickLeave.status != SickLeaveStatus.DELETED
        )

        if employee_id:
            query = query.where(SickLeave.employee_id == employee_id)

        if year:
            query = query.where(func.extract('year', SickLeave.start_date) == year)

        if sick_leave_type:
            query = query.where(SickLeave.sick_leave_type == sick_leave_type)

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
        self,
        db: AsyncSession,
        employee_id: int,
        year: Optional[int] = None
    ) -> List[SickLeave]:
        """Получить все больничные сотрудника за год (активные и отмененные)."""
        query = select(SickLeave).where(
            SickLeave.employee_id == employee_id,
            SickLeave.status != SickLeaveStatus.DELETED
        )

        if year:
            query = query.where(func.extract('year', SickLeave.start_date) == year)

        query = query.order_by(SickLeave.start_date.desc())
        result = await db.execute(query)
        return list(result.scalars().all())

    async def update(self, db: AsyncSession, sick_leave: SickLeave, update_data: dict) -> SickLeave:
        """Обновить запись о больничном."""
        for field, value in update_data.items():
            if hasattr(sick_leave, field) and value is not None:
                setattr(sick_leave, field, value)

        sick_leave.updated_at = date.today()
        await db.commit()
        await db.refresh(sick_leave)
        return sick_leave

    async def soft_delete(self, db: AsyncSession, sick_leave: SickLeave, user_id: int) -> bool:
        """Мягкое удаление больничного (установка статуса DELETED)."""
        sick_leave.status = SickLeaveStatus.DELETED
        sick_leave.deleted_by = user_id
        await db.commit()
        return True

    async def cancel(self, db: AsyncSession, sick_leave: SickLeave, user_id: int) -> bool:
        """Отмена больничного."""
        if sick_leave.status != SickLeaveStatus.ACTIVE:
            return False
        
        sick_leave.status = SickLeaveStatus.CANCELLED
        sick_leave.cancelled_by = user_id
        await db.commit()
        return True

    async def check_overlap(
        self,
        db: AsyncSession,
        employee_id: int,
        start_date: date,
        end_date: date,
        exclude_id: Optional[int] = None
    ) -> Optional[SickLeave]:
        """
        Проверить пересечение с активными больничными.
        Условие пересечения: (StartA <= EndB) и (EndA >= StartB)
        """
        query = select(SickLeave).where(
            SickLeave.employee_id == employee_id,
            SickLeave.status == SickLeaveStatus.ACTIVE,
            SickLeave.start_date <= end_date,
            SickLeave.end_date >= start_date
        )

        if exclude_id:
            query = query.where(SickLeave.id != exclude_id)

        result = await db.execute(query)
        return result.scalars().first()

    async def get_total_sick_days(
        self,
        db: AsyncSession,
        employee_id: int,
        year: int
    ) -> int:
        """Получить общее количество дней больничных за год (только активные)."""
        query = select(
            func.sum(
                func.date_part('day', SickLeave.end_date) - 
                func.date_part('day', SickLeave.start_date) + 1
            )
        ).where(
            SickLeave.employee_id == employee_id,
            SickLeave.status == SickLeaveStatus.ACTIVE,
            func.extract('year', SickLeave.start_date) == year
        )

        result = await db.execute(query)
        total = result.scalar()
        return int(total) if total else 0

    async def get_employees_summary(
        self,
        db: AsyncSession,
        search_query: Optional[str] = None,
        include_archived: bool = False
    ) -> List[dict]:
        """
        Получить сводку по больничным для всех сотрудников.
        Возвращает список словарей с информацией о сотруднике и статистике.
        """
        # Базовый запрос
        query = select(
            Employee.id,
            Employee.name,
            Employee.tab_number,
            Department.name.label('department'),
            func.count(SickLeave.id).label('sick_leaves_count'),
            func.coalesce(
                func.sum(
                    func.date_part('day', SickLeave.end_date) - 
                    func.date_part('day', SickLeave.start_date) + 1
                ),
                0
            ).label('total_sick_days')
        ).outerjoin(
            SickLeave,
            (SickLeave.employee_id == Employee.id) & (SickLeave.status == SickLeaveStatus.ACTIVE)
        ).outerjoin(
            Department,
            Employee.department_id == Department.id
        ).where(
            Employee.is_deleted == False
        )

        if not include_archived:
            query = query.where(Employee.is_archived == False)

        if search_query:
            query = query.where(
                (Employee.name.ilike(f"%{search_query}%")) |
                (Employee.tab_number.cast(String).ilike(f"%{search_query}%"))
            )

        query = query.group_by(Employee.id, Employee.name, Employee.tab_number, Department.name)
        query = query.order_by(Employee.name)

        result = await db.execute(query)
        rows = result.fetchall()

        return [
            {
                'employee_id': row.id,
                'employee_name': row.name,
                'tab_number': row.tab_number,
                'department': row.department,
                'total_sick_days': int(row.total_sick_days),
                'sick_leaves_count': row.sick_leaves_count
            }
            for row in rows
        ]
