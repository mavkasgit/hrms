from datetime import datetime
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee, EmployeeAuditLog


class EmployeeRepository:
    async def get_by_id(self, db: AsyncSession, employee_id: int, include_deleted: bool = False) -> Optional[Employee]:
        conditions = [Employee.id == employee_id]
        if not include_deleted:
            conditions.append(Employee.is_deleted == False)
        result = await db.execute(select(Employee).where(and_(*conditions)))
        return result.scalar_one_or_none()

    async def get_by_tab_number(self, db: AsyncSession, tab_number: int, include_deleted: bool = False) -> Optional[Employee]:
        conditions = [Employee.tab_number == tab_number]
        if not include_deleted:
            conditions.append(Employee.is_deleted == False)
        result = await db.execute(select(Employee).where(and_(*conditions)))
        return result.scalar_one_or_none()

    async def get_all(
        self,
        db: AsyncSession,
        department: Optional[str] = None,
        status: str = "active",
        page: int = 1,
        per_page: int = 20,
        sort_by: Optional[str] = None,
        sort_order: str = "asc",
    ) -> tuple[list[Employee], int]:
        conditions = []

        if status == "active":
            conditions.append(Employee.is_deleted == False)
            conditions.append(Employee.is_archived == False)
        elif status == "archived":
            conditions.append(Employee.is_deleted == False)
            conditions.append(Employee.is_archived == True)
        elif status == "deleted":
            conditions.append(Employee.is_deleted == True)
        elif status == "all":
            pass

        if department:
            conditions.append(Employee.department == department)

        where_clause = and_(*conditions) if conditions else True

        count_query = select(func.count(Employee.id)).where(where_clause)
        total_result = await db.execute(count_query)
        total = total_result.scalar()

        sort_column = getattr(Employee, sort_by, Employee.name) if sort_by else Employee.name
        order_expr = sort_column.asc() if sort_order == "asc" else sort_column.desc()

        data_query = (
            select(Employee)
            .where(where_clause)
            .order_by(order_expr)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        result = await db.execute(data_query)
        items = list(result.scalars().all())

        return items, total

    async def search(self, db: AsyncSession, q: str) -> list[Employee]:
        results: dict[int, Employee] = {}

        name_start_result = await db.execute(
            select(Employee)
            .where(Employee.name.ilike(f"{q}%"), Employee.is_deleted == False)
            .order_by(Employee.name.asc())
        )
        for emp in name_start_result.scalars().all():
            results[emp.id] = emp

        name_contains_result = await db.execute(
            select(Employee)
            .where(Employee.name.ilike(f"%{q}%"), Employee.is_deleted == False)
            .order_by(Employee.name.asc())
        )
        for emp in name_contains_result.scalars().all():
            results[emp.id] = emp

        if q.isdigit():
            tab = int(q)
            emp = await self.get_by_tab_number(db, tab)
            if emp:
                results[emp.id] = emp

        return sorted(results.values(), key=lambda e: e.name)

    async def create(self, db: AsyncSession, data: dict) -> Employee:
        employee = Employee(**data)
        db.add(employee)
        await db.flush()
        await db.refresh(employee)
        return employee

    async def update(self, db: AsyncSession, employee_id: int, data: dict) -> Optional[Employee]:
        employee = await self.get_by_id(db, employee_id)
        if not employee:
            return None
        for key, value in data.items():
            if value is not None:
                setattr(employee, key, value)
        await db.flush()
        await db.refresh(employee)
        return employee

    async def archive(
        self,
        db: AsyncSession,
        employee_id: int,
        user_id: str,
        reason: Optional[str] = None,
    ) -> Optional[Employee]:
        employee = await self.get_by_id(db, employee_id)
        if not employee:
            return None
        employee.is_archived = True
        employee.terminated_date = datetime.now().date()
        employee.termination_reason = reason
        employee.archived_by = user_id
        employee.archived_at = datetime.now()
        await db.flush()
        await db.refresh(employee)
        return employee

    async def restore(self, db: AsyncSession, employee_id: int, user_id: str) -> Optional[Employee]:
        employee = await self.get_by_id(db, employee_id)
        if not employee:
            return None
        employee.is_archived = False
        employee.terminated_date = None
        employee.termination_reason = None
        employee.archived_by = None
        employee.archived_at = None
        await db.flush()
        await db.refresh(employee)
        return employee

    async def soft_delete(self, db: AsyncSession, employee_id: int, user_id: str) -> bool:
        employee = await self.get_by_id(db, employee_id, include_deleted=True)
        if not employee:
            return False
        employee.is_deleted = True
        employee.deleted_at = datetime.now()
        employee.deleted_by = user_id
        await db.flush()
        return True

    async def hard_delete(self, db: AsyncSession, employee_id: int) -> bool:
        employee = await self.get_by_id(db, employee_id, include_deleted=True)
        if not employee:
            return False
        await db.delete(employee)
        await db.flush()
        return True

    async def get_audit_log(self, db: AsyncSession, employee_id: int) -> list[EmployeeAuditLog]:
        result = await db.execute(
            select(EmployeeAuditLog)
            .where(EmployeeAuditLog.employee_id == employee_id)
            .order_by(EmployeeAuditLog.performed_at.desc())
        )
        return list(result.scalars().all())

    async def get_departments(self, db: AsyncSession) -> list[str]:
        result = await db.execute(
            select(Employee.department)
            .where(Employee.is_deleted == False)
            .distinct()
            .order_by(Employee.department.asc())
        )
        return [row[0] for row in result.all()]

    async def get_future_vacations(self, db: AsyncSession, employee_id: int) -> list:
        from app.models.vacation import Vacation
        from datetime import date
        result = await db.execute(
            select(Vacation).where(
                Vacation.employee_id == employee_id,
                Vacation.start_date > date.today(),
                Vacation.is_deleted == False,
            )
        )
        return list(result.scalars().all())

    async def _add_audit_entry(
        self,
        db: AsyncSession,
        employee_id: int,
        action: str,
        performed_by: str,
        reason: Optional[str],
        changed_fields: Optional[dict],
    ) -> EmployeeAuditLog:
        entry = EmployeeAuditLog(
            employee_id=employee_id,
            action=action,
            changed_fields=changed_fields,
            performed_by=performed_by,
            reason=reason,
        )
        db.add(entry)
        await db.flush()
        return entry
