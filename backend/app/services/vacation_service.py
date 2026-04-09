from datetime import date
from typing import Optional, List, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.vacation_repository import vacation_repository
from app.repositories.references_repository import references_repository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.order_repository import order_repository
from app.services.order_service import order_service
from app.services.vacation_period_service import vacation_period_service, auto_use_days
from app.utils.working_days import calculate_vacation_days, count_holidays_in_range
from app.core.exceptions import (
    EmployeeNotFoundError,
    VacationNotFoundError,
    VacationOverlapError,
    InsufficientVacationDaysError,
)
from app.models.employee import Employee
from sqlalchemy import select


class VacationService:
    async def create_vacation(
        self, db: AsyncSession, data: dict, user_id: str
    ) -> dict:
        print(f"[create_vacation] START: employee_id={data.get('employee_id')}, start={data.get('start_date')}, end={data.get('end_date')}, type={data.get('vacation_type')}")
        
        employee_id = data["employee_id"]
        start_date = data["start_date"]
        end_date = data["end_date"]
        vacation_type = data["vacation_type"]

        employee_repo = EmployeeRepository()
        employee = await employee_repo.get_by_id(db, employee_id)
        print(f"[create_vacation] employee found: {employee is not None}")
        if not employee:
            raise EmployeeNotFoundError(employee_id)

        if end_date < start_date:
            print(f"[create_vacation] WARNING: end_date < start_date: {end_date} < {start_date}")
            raise InsufficientVacationDaysError("Дата конца раньше даты начала")

        overlap = await vacation_repository.check_overlap(
            db, employee_id, start_date, end_date
        )
        if overlap:
            print(f"[create_vacation] WARNING overlap: {overlap}")
            raise VacationOverlapError(
                f"Пересекается с отпуском с {overlap.start_date} по {overlap.end_date}"
            )

        holidays = await references_repository.get_holidays_for_year(db, start_date.year)
        print(f"[create_vacation] holidays for {start_date.year}: {holidays}")
        if end_date.year != start_date.year:
            holidays += await references_repository.get_holidays_for_year(db, end_date.year)

        holidays_count = count_holidays_in_range(holidays, start_date, end_date)
        days_count = calculate_vacation_days(start_date, end_date, holidays_count)
        print(f"[create_vacation] days_count={days_count}, holidays_count={holidays_count}")

        if days_count <= 0:
            print(f"[create_vacation] WARNING days_count <= 0: {days_count}")
            raise InsufficientVacationDaysError("Нет дней отпуска в выбранном диапазоне")

        # Проверяем баланс через систему периодов
        print(f"[create_vacation] checking balance for employee_id={employee_id}, days_count={days_count}")
        try:
            await vacation_period_service.check_balance_before_create(db, employee_id, days_count)
            print(f"[create_vacation] balance check passed")
        except Exception as e:
            print(f"[create_vacation] ERROR balance check failed: {e}")
            raise
        
        # Списываем дни с периодов (от старого к новому)
        print(f"[create_vacation] calling auto_use_days for employee_id={employee_id}, days_count={days_count}")
        try:
            await auto_use_days(db, employee_id, days_count)
            print(f"[create_vacation] auto_use_days completed")
        except Exception as e:
            print(f"[create_vacation] ERROR auto_use_days failed: {e}")
            raise

        # Старая проверка баланса удалена - теперь используем систему периодов

        vacation_data = {
            "employee_id": employee_id,
            "start_date": start_date,
            "end_date": end_date,
            "vacation_type": vacation_type,
            "days_count": days_count,
            "vacation_year": start_date.year,
            "comment": data.get("comment"),
        }
        print(f"[create_vacation] before vacation_repository.create with data: {vacation_data}")
        vacation = await vacation_repository.create(db, vacation_data)
        print(f"[create_vacation] after vacation_repository.create, vacation_id: {vacation.id}")

        order_type_map = {
            "Трудовой": "Отпуск трудовой",
            "За свой счет": "Отпуск за свой счет",
        }
        order_type = order_type_map.get(vacation_type, "Отпуск трудовой")

        from app.schemas.order import OrderCreate

        order_data = OrderCreate(
            employee_id=employee_id,
            order_type=order_type,
            order_date=data.get("order_date") or date.today(),
            extra_fields={
                "vacation_start": start_date.isoformat(),
                "vacation_end": end_date.isoformat(),
                "vacation_days": days_count,
            },
        )
        print(f"[create_vacation] before order_service.create_order with data: {order_data.model_dump()}")
        order = await order_service.create_order(db, order_data)
        print(f"[create_vacation] after order_service.create_order, order_id: {order.id}")

        # Link order back to vacation
        vacation.order_id = order.id
        print(f"[create_vacation] before db.flush")
        await db.flush()
        print(f"[create_vacation] after db.flush")

        print(f"[create_vacation] before db.commit")
        await db.commit()
        print(f"[create_vacation] after db.commit")

        return {
            "id": vacation.id,
            "employee_id": vacation.employee_id,
            "employee_name": employee.name,
            "start_date": str(vacation.start_date),
            "end_date": str(vacation.end_date),
            "vacation_type": vacation.vacation_type,
            "days_count": vacation.days_count,
            "comment": vacation.comment,
            "created_at": str(vacation.created_at),
            "order_id": order.id,
            "order_number": order.order_number,
        }

    async def update_vacation(
        self, db: AsyncSession, id: int, data: dict, user_id: str
    ) -> dict:
        vacation = await vacation_repository.get_by_id(db, id)
        if not vacation:
            raise VacationNotFoundError(id)

        start_date = data.get("start_date", vacation.start_date)
        end_date = data.get("end_date", vacation.end_date)
        vacation_type = data.get("vacation_type", vacation.vacation_type)

        if end_date < start_date:
            raise InsufficientVacationDaysError("Дата конца раньше даты начала")

        overlap = await vacation_repository.check_overlap(
            db, vacation.employee_id, start_date, end_date, exclude_id=id
        )
        if overlap:
            raise VacationOverlapError(
                f"Пересекается с отпуском с {overlap.start_date} по {overlap.end_date}"
            )

        holidays = await references_repository.get_holidays_for_year(db, start_date.year)
        if end_date.year != start_date.year:
            holidays += await references_repository.get_holidays_for_year(db, end_date.year)

        holidays_count = count_holidays_in_range(holidays, start_date, end_date)
        days_count = calculate_vacation_days(start_date, end_date, holidays_count)

        update_data = {
            "start_date": start_date,
            "end_date": end_date,
            "vacation_type": vacation_type,
            "days_count": days_count,
            "vacation_year": start_date.year,
        }
        if "comment" in data:
            update_data["comment"] = data["comment"]

        updated = await vacation_repository.update(db, id, update_data)
        await db.commit()

        employee_repo = EmployeeRepository()
        employee = await employee_repo.get_by_id(db, updated.employee_id)

        return {
            "id": updated.id,
            "employee_id": updated.employee_id,
            "employee_name": employee.name if employee else None,
            "start_date": str(updated.start_date),
            "end_date": str(updated.end_date),
            "vacation_type": updated.vacation_type,
            "days_count": updated.days_count,
            "comment": updated.comment,
            "created_at": str(updated.created_at),
        }

    async def delete_vacation(self, db: AsyncSession, id: int, user_id: str) -> bool:
        """Полное удаление отпуска + связанного приказа + файла."""
        vacation = await vacation_repository.get_by_id(db, id)
        if not vacation:
            raise VacationNotFoundError(id)

        order_id = vacation.order_id

        # Получаем информацию о приказе для удаления файла
        order_file_path = None
        if order_id:
            from app.repositories.order_repository import order_repository
            order = await order_repository.get_by_id(db, order_id)
            if order:
                order_file_path = order.file_path

        # Удаляем отпуск
        await vacation_repository.hard_delete(db, id)

        # Удаляем приказ
        if order_id:
            from app.repositories.order_repository import order_repository
            await order_repository.hard_delete(db, order_id)

        # Удаляем файл
        if order_file_path:
            import os
            try:
                os.remove(order_file_path)
            except OSError:
                pass

        await db.commit()
        return True

    async def cancel_vacation(self, db: AsyncSession, id: int, user_id: str) -> bool:
        """Отмена отпуска + отмена связанного приказа."""
        vacation = await vacation_repository.get_by_id(db, id)
        if not vacation:
            raise VacationNotFoundError(id)

        # Отменяем связанный приказ
        if vacation.order_id:
            from app.repositories.order_repository import order_repository
            await order_repository.cancel(db, vacation.order_id, user_id)

        # Отменяем отпуск
        result = await vacation_repository.cancel(db, id, user_id)
        await db.commit()
        return result

    async def get_vacation_balance(
        self, db: AsyncSession, employee_id: int, year: int
    ) -> dict:
        return await vacation_repository.get_vacation_balance(db, employee_id, year)

    async def get_employees_summary(
        self,
        db: AsyncSession,
        q: Optional[str] = None,
        archive_filter: str = "active",
    ) -> List[Dict[str, Any]]:
        return await vacation_repository.get_employees_summary(db, q=q, archive_filter=archive_filter)

    async def get_employee_vacation_history(
        self, db: AsyncSession, employee_id: int
    ) -> Dict[str, Any]:
        return await vacation_repository.get_employee_vacation_history(db, employee_id)

    async def update_employee_correction(
        self, db: AsyncSession, employee_id: int, correction: int
    ) -> bool:
        result = await db.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        employee = result.scalar_one_or_none()
        if not employee:
            return False
        employee.vacation_days_correction = correction
        await db.flush()
        await db.refresh(employee)
        return True


vacation_service = VacationService()
