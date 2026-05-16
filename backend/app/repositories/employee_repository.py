from datetime import datetime
from typing import List, Optional

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.employee import Employee, EmployeeAuditLog


class EmployeeRepository:
    async def get_by_id(self, db: AsyncSession, employee_id: int, include_deleted: bool = False) -> Optional[Employee]:
        conditions = [Employee.id == employee_id]
        if not include_deleted:
            conditions.append(Employee.is_deleted == False)
        result = await db.execute(
            select(Employee)
            .options(joinedload(Employee.department), joinedload(Employee.position))
            .where(and_(*conditions))
        )
        return result.scalar_one_or_none()

    async def get_by_tab_number(self, db: AsyncSession, tab_number: int, include_deleted: bool = False) -> Optional[Employee]:
        conditions = [Employee.tab_number == tab_number]
        if not include_deleted:
            conditions.append(Employee.is_deleted == False)
        result = await db.execute(
            select(Employee)
            .options(joinedload(Employee.department), joinedload(Employee.position))
            .where(and_(*conditions))
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        db: AsyncSession,
        department_id: Optional[int] = None,
        gender: Optional[str] = None,
        rate_type: Optional[str] = None,
        concurrent_employment_type: Optional[List[str]] = None,
        status: str = "active",
        page: int = 1,
        per_page: int = 20,
        sort_by: Optional[str] = None,
        sort_order: str = "asc",
    ) -> tuple[list[Employee], int]:
        conditions = []

        if status == "active":
            conditions.append(Employee.is_deleted == False)
            conditions.append(Employee.is_dismissed == False)
        elif status == "dismissed":
            conditions.append(Employee.is_deleted == False)
            conditions.append(Employee.is_dismissed == True)
        elif status == "deleted":
            conditions.append(Employee.is_deleted == True)
        elif status == "all":
            pass

        if department_id:
            conditions.append(Employee.department_id == department_id)

        if gender:
            conditions.append(Employee.gender == gender)

        if rate_type == "full":
            conditions.append(or_(Employee.rate >= 1.0, Employee.rate.is_(None)))
        elif rate_type == "partial":
            conditions.append(or_(Employee.rate < 1.0, Employee.rate.is_(None)))

        if concurrent_employment_type and len(concurrent_employment_type) > 0:
            conditions.append(Employee.employment_type.in_(concurrent_employment_type))

        where_clause = and_(*conditions) if conditions else True

        count_query = select(func.count(Employee.id)).where(where_clause)
        total_result = await db.execute(count_query)
        total = total_result.scalar()

        sort_column = getattr(Employee, sort_by, Employee.name) if sort_by else Employee.name
        order_expr = sort_column.asc() if sort_order == "asc" else sort_column.desc()

        data_query = (
            select(Employee)
            .options(joinedload(Employee.department), joinedload(Employee.position))
            .where(where_clause)
            .order_by(order_expr)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        result = await db.execute(data_query)
        items = list(result.unique().scalars().all())

        return items, total

    async def search(self, db: AsyncSession, q: str) -> list[Employee]:
        results: dict[int, Employee] = {}

        name_start_result = await db.execute(
            select(Employee)
            .options(joinedload(Employee.department), joinedload(Employee.position))
            .where(Employee.name.ilike(f"{q}%"), Employee.is_deleted == False)
            .order_by(Employee.name.asc())
        )
        for emp in name_start_result.unique().scalars().all():
            results[emp.id] = emp

        name_contains_result = await db.execute(
            select(Employee)
            .options(joinedload(Employee.department), joinedload(Employee.position))
            .where(Employee.name.ilike(f"%{q}%"), Employee.is_deleted == False)
            .order_by(Employee.name.asc())
        )
        for emp in name_contains_result.unique().scalars().all():
            results[emp.id] = emp

        if q.isdigit():
            tab = int(q)
            emp = await self.get_by_tab_number(db, tab)
            if emp:
                results[emp.id] = emp

        # Поиск по тегам
        from app.models.tag import Tag, EmployeeTag
        tag_result = await db.execute(
            select(Employee)
            .options(joinedload(Employee.department), joinedload(Employee.position))
            .join(EmployeeTag, EmployeeTag.employee_id == Employee.id)
            .join(Tag, Tag.id == EmployeeTag.tag_id)
            .where(Tag.name.ilike(f"%{q}%"), Employee.is_deleted == False)
            .order_by(Employee.name.asc())
        )
        for emp in tag_result.unique().scalars().all():
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

    async def dismiss(
        self,
        db: AsyncSession,
        employee_id: int,
        user_id: str,
        reason: Optional[str] = None,
    ) -> Optional[Employee]:
        employee = await self.get_by_id(db, employee_id)
        if not employee:
            return None
        employee.is_dismissed = True
        employee.dismissal_date = datetime.now().date()
        employee.dismissal_reason = reason
        employee.dismissed_by = user_id
        employee.dismissed_at = datetime.now()
        await db.flush()
        await db.refresh(employee)
        return employee

    async def restore(self, db: AsyncSession, employee_id: int, user_id: str) -> Optional[Employee]:
        employee = await self.get_by_id(db, employee_id)
        if not employee:
            return None
        employee.is_dismissed = False
        employee.dismissal_date = None
        employee.dismissal_reason = None
        employee.dismissed_by = None
        employee.dismissed_at = None
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

    async def delete_related_records(self, db: AsyncSession, employee_id: int) -> None:
        """Удалить все связанные записи ПЕРЕД удалением сотрудника."""
        from app.models.employee import EmployeeAuditLog
        from app.models.vacation import Vacation
        from app.models.vacation_plan import VacationPlan
        from app.models.vacation_period import VacationPeriod
        from app.models.vacation_period_manual_closure import VacationPeriodManualClosure
        from app.models.vacation_adjustment import VacationAdjustment
        from app.models.hire_date_adjustment import HireDateAdjustment
        from app.models.sick_leave import SickLeave
        from app.models.order_employee import OrderEmployee
        from app.models.tag import EmployeeTag
        from app.models.department import Department
        from app.models.order import Order
        from sqlalchemy import delete, update

        await db.execute(delete(EmployeeTag).where(EmployeeTag.employee_id == employee_id))

        await db.execute(delete(HireDateAdjustment).where(HireDateAdjustment.employee_id == employee_id))

        await db.execute(delete(SickLeave).where(SickLeave.employee_id == employee_id))

        await db.execute(delete(VacationAdjustment).where(VacationAdjustment.employee_id == employee_id))

        from app.models.vacation_period_transaction import VacationPeriodTransaction
        from app.models.vacation_period_manual_closure import VacationPeriodManualClosure

        # Сначала удаляем транзакции, ссылающиеся на manual closures
        closure_ids = await db.execute(
            select(VacationPeriodManualClosure.id).where(VacationPeriodManualClosure.employee_id == employee_id)
        )
        closure_ids = [row[0] for row in closure_ids.all()]
        if closure_ids:
            await db.execute(
                delete(VacationPeriodTransaction).where(
                    VacationPeriodTransaction.manual_closure_id.in_(closure_ids)
                )
            )

        await db.execute(delete(VacationPeriodManualClosure).where(VacationPeriodManualClosure.employee_id == employee_id))

        await db.execute(delete(VacationPeriod).where(VacationPeriod.employee_id == employee_id))

        await db.execute(delete(OrderEmployee).where(OrderEmployee.employee_id == employee_id))

        await db.execute(
            update(Department)
            .where(Department.head_employee_id == employee_id)
            .values(head_employee_id=None)
        )

        await db.execute(
            update(Vacation).where(Vacation.employee_id == employee_id).values(order_id=None)
        )

        await db.execute(delete(Order).where(Order.employee_id == employee_id))

        await db.execute(delete(VacationPlan).where(VacationPlan.employee_id == employee_id))

        await db.execute(delete(Vacation).where(Vacation.employee_id == employee_id))

        await db.execute(delete(EmployeeAuditLog).where(EmployeeAuditLog.employee_id == employee_id))

        await db.flush()

    async def get_audit_log(self, db: AsyncSession, employee_id: int) -> list[EmployeeAuditLog]:
        result = await db.execute(
            select(EmployeeAuditLog)
            .where(EmployeeAuditLog.employee_id == employee_id)
            .order_by(EmployeeAuditLog.performed_at.desc())
        )
        return list(result.scalars().all())

    async def get_departments(self, db: AsyncSession) -> list[int]:
        result = await db.execute(
            select(Employee.department_id)
            .where(Employee.is_deleted == False)
            .distinct()
            .order_by(Employee.department_id.asc())
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
