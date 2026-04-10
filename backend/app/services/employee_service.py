from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    DuplicateTabNumberError,
    EmployeeAlreadyArchivedError,
    EmployeeDeletedError,
    EmployeeNotFoundError,
    EmployeeNotArchivedError,
)
from app.models.employee import Employee
from app.repositories.employee_repository import EmployeeRepository
from app.services.vacation_period_service import vacation_period_service
from app.schemas.employee import EmployeeCreate, EmployeeUpdate

repository = EmployeeRepository()


class EmployeeService:
    async def get_all_employees(
        self,
        db: AsyncSession,
        department_id: Optional[int] = None,
        gender: Optional[str] = None,
        status: str = "active",
        page: int = 1,
        per_page: int = 20,
        sort_by: Optional[str] = None,
        sort_order: str = "asc",
    ) -> dict:
        items, total = await repository.get_all(
            db,
            department_id=department_id,
            gender=gender,
            status=status,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        total_pages = max(1, (total + per_page - 1) // per_page)
        return {
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    async def get_by_id(self, db: AsyncSession, employee_id: int) -> Employee:
        employee = await repository.get_by_id(db, employee_id)
        if not employee:
            raise EmployeeNotFoundError(employee_id)
        if employee.is_deleted:
            raise EmployeeDeletedError(employee_id)
        return employee

    async def get_by_tab_number(self, db: AsyncSession, tab_number: int) -> Employee:
        employee = await repository.get_by_tab_number(db, tab_number)
        if not employee:
            raise EmployeeNotFoundError(tab_number)
        if employee.is_deleted:
            raise EmployeeDeletedError(tab_number)
        return employee

    async def search_employees(self, db: AsyncSession, q: str) -> list[Employee]:
        if not q or len(q.strip()) < 1:
            return []
        return await repository.search(db, q.strip())

    async def create_employee(self, db: AsyncSession, data: EmployeeCreate, user_id: str) -> Employee:
        if data.tab_number:
            existing = await repository.get_by_tab_number(db, data.tab_number, include_deleted=True)
            if existing:
                raise DuplicateTabNumberError(data.tab_number)

        employee = await repository.create(db, data.model_dump())

        # Создаём все периоды отпусков если есть contract_start
        if data.contract_start:
            await vacation_period_service.ensure_periods_for_employee(
                db,
                employee_id=employee.id,
                contract_start=data.contract_start,
                additional_days=data.additional_vacation_days or 0,
            )

        # Конвертируем даты в строки для JSON
        audit_data = data.model_dump()
        for key, value in audit_data.items():
            if hasattr(value, 'isoformat'):  # Проверяем, является ли значение датой
                audit_data[key] = value.isoformat()

        await repository._add_audit_entry(db, employee.id, "created", user_id, None, audit_data)
        return employee

    async def update_employee(
        self, db: AsyncSession, employee_id: int, data: EmployeeUpdate, user_id: str
    ) -> Employee:
        employee = await self.get_by_id(db, employee_id)

        old_values = {}
        update_data = data.model_dump(exclude_unset=True)
        for key in update_data:
            old_values[key] = getattr(employee, key)

        employee = await repository.update(db, employee_id, update_data)

        # Если изменились additional_vacation_days — обновить все периоды
        if "additional_vacation_days" in update_data and employee.contract_start:
            await vacation_period_service.ensure_periods_for_employee(
                db, employee_id, employee.contract_start, update_data["additional_vacation_days"]
            )

        changed_fields = {}
        for key, new_value in update_data.items():
            old_value = old_values.get(key)
            if old_value != new_value:
                changed_fields[key] = {"old": str(old_value), "new": str(new_value)}

        if changed_fields:
            await repository._add_audit_entry(db, employee_id, "updated", user_id, None, changed_fields)

        return employee

    async def archive_employee(
        self, db: AsyncSession, employee_id: int, user_id: str, reason: Optional[str] = None
    ) -> tuple[Employee, list[str]]:
        employee = await self.get_by_id(db, employee_id)

        if employee.is_archived:
            raise EmployeeAlreadyArchivedError(employee_id)

        warnings = await self._check_archive_warnings(db, employee_id)

        old_values = {
            "is_archived": employee.is_archived,
            "terminated_date": employee.terminated_date,
            "termination_reason": employee.termination_reason,
        }

        employee = await repository.archive(db, employee_id, user_id, reason)

        changed_fields = {
            "is_archived": {"old": False, "new": True},
            "terminated_date": {"old": None, "new": str(employee.terminated_date)},
            "termination_reason": {"old": None, "new": reason},
        }
        await repository._add_audit_entry(db, employee_id, "archived", user_id, reason, changed_fields)

        return employee, warnings

    async def restore_employee(self, db: AsyncSession, employee_id: int, user_id: str) -> Employee:
        employee = await repository.get_by_id(db, employee_id)
        if not employee:
            raise EmployeeNotFoundError(employee_id)

        if not employee.is_archived:
            raise EmployeeNotArchivedError(employee_id)

        employee = await repository.restore(db, employee_id, user_id)

        changed_fields = {
            "is_archived": {"old": True, "new": False},
            "terminated_date": {"old": str(employee.terminated_date), "new": None},
            "termination_reason": {"old": employee.termination_reason, "new": None},
        }
        await repository._add_audit_entry(db, employee_id, "restored", user_id, None, changed_fields)

        return employee

    async def soft_delete_employee(self, db: AsyncSession, employee_id: int, user_id: str) -> bool:
        employee = await repository.get_by_id(db, employee_id, include_deleted=True)
        if not employee:
            raise EmployeeNotFoundError(employee_id)

        if employee.is_deleted:
            return False

        await repository.soft_delete(db, employee_id, user_id)

        await repository._add_audit_entry(db, employee_id, "deleted", user_id, None, None)
        return True

    async def hard_delete_employee(self, db: AsyncSession, employee_id: int, user_id: str) -> bool:
        employee = await repository.get_by_id(db, employee_id, include_deleted=True)
        if not employee:
            raise EmployeeNotFoundError(employee_id)

        await repository._add_audit_entry(db, employee_id, "hard_deleted", user_id, None, None)

        return await repository.hard_delete(db, employee_id)

    async def get_audit_log(self, db: AsyncSession, employee_id: int) -> list:
        await self.get_by_id(db, employee_id)
        return await repository.get_audit_log(db, employee_id)

    async def get_archive_warnings(self, db: AsyncSession, employee_id: int) -> list[str]:
        await self.get_by_id(db, employee_id)
        return await self._check_archive_warnings(db, employee_id)

    async def get_departments(self, db: AsyncSession) -> list[str]:
        return await repository.get_departments(db)

    async def _check_archive_warnings(self, db: AsyncSession, employee_id: int) -> list[str]:
        warnings = []
        future_vacations = await repository.get_future_vacations(db, employee_id)
        if future_vacations:
            count = len(future_vacations)
            warnings.append(f"Запланировано отпусков: {count}")
        return warnings


employee_service = EmployeeService()
