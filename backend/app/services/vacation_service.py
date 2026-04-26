from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    EmployeeNotFoundError,
    InsufficientVacationDaysError,
    VacationNotFoundError,
    VacationOverlapError,
)
from app.core.logging import get_audit_logger
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.references_repository import references_repository
from app.repositories.vacation_repository import vacation_repository
from app.schemas.order import OrderCreate
from app.services.order_service import order_service
from app.services.vacation_period_service import auto_use_days, vacation_period_service
from app.utils.working_days import calculate_vacation_days, count_holidays_in_range

audit_logger = get_audit_logger()


class VacationService:
    ORDER_TYPE_CODES = {
        "Трудовой": "vacation_paid",
        "За свой счет": "vacation_unpaid",
    }

    def _build_order_payload(self, data: dict[str, Any], days_count: int) -> dict[str, Any]:
        vacation_type = data["vacation_type"]
        order_type_code = self.ORDER_TYPE_CODES.get(vacation_type, "vacation_paid")
        return {
            "order_type_code": order_type_code,
            "order_date": data.get("order_date") or data["start_date"],
            "order_number": data.get("order_number"),
            "notes": data.get("comment"),
            "extra_fields": {
                "vacation_start": data["start_date"].isoformat(),
                "vacation_end": data["end_date"].isoformat(),
                "vacation_days": days_count,
                "vacation_type": vacation_type,
            },
        }

    async def _create_linked_order(
        self,
        db: AsyncSession,
        employee_id: int,
        vacation_data: dict[str, Any],
        days_count: int,
    ):
        order_payload = self._build_order_payload(vacation_data, days_count)
        order_type = await order_service.get_order_type_by_code(db, order_payload["order_type_code"])
        return await order_service.create_order(
            db,
            OrderCreate(
                employee_id=employee_id,
                order_type_id=order_type.id,
                order_date=order_payload["order_date"],
                order_number=order_payload["order_number"],
                notes=order_payload["notes"],
                extra_fields=order_payload["extra_fields"],
                preview_id=vacation_data.get("preview_id"),
                edited_html=vacation_data.get("edited_html"),
            ),
        )

    async def create_vacation(self, db: AsyncSession, data: dict, user_id: str) -> dict:
        employee_id = data["employee_id"]
        start_date = data["start_date"]
        end_date = data["end_date"]
        vacation_type = data["vacation_type"]

        employee_repo = EmployeeRepository()
        employee = await employee_repo.get_by_id(db, employee_id)
        if not employee:
            raise EmployeeNotFoundError(employee_id)

        if employee.hire_date:
            await vacation_period_service.ensure_periods_for_employee(
                db,
                employee_id,
                employee.hire_date,
                employee.additional_vacation_days or 0,
            )

        if end_date < start_date:
            raise InsufficientVacationDaysError("Дата конца раньше даты начала")

        overlap = await vacation_repository.check_overlap(db, employee_id, start_date, end_date)
        if overlap:
            raise VacationOverlapError(f"Пересекается с отпуском с {overlap.start_date} по {overlap.end_date}")

        holidays = await references_repository.get_holidays_for_year(db, start_date.year)
        if end_date.year != start_date.year:
            holidays += await references_repository.get_holidays_for_year(db, end_date.year)

        holidays_count = count_holidays_in_range(holidays, start_date, end_date)
        days_count = calculate_vacation_days(start_date, end_date, holidays_count)

        if days_count <= 0:
            raise InsufficientVacationDaysError("Нет дней отпуска в выбранном диапазоне")

        order = await self._create_linked_order(db, employee_id, data, days_count)
        vacation = await vacation_repository.create(
            db,
            {
                "employee_id": employee_id,
                "start_date": start_date,
                "end_date": end_date,
                "vacation_type": vacation_type,
                "days_count": days_count,
                "vacation_year": start_date.year,
                "comment": data.get("comment"),
                "order_id": order.id,
            },
        )

        await auto_use_days(
            db, employee_id, days_count,
            employee.hire_date,
            employee.additional_vacation_days or 0,
            order.id, order.order_number
        )
        await db.flush()
        await db.commit()

        audit_logger.info(
            f"VACATION CREATED: id={vacation.id}, employee_id={employee_id}, employee_name={employee.name}, "
            f"start={start_date}, end={end_date}, type={vacation_type}, days={days_count}, order_id={order.id}",
            extra={
                "employee_id": employee_id,
                "employee_name": employee.name,
                "action": "vacation_created",
                "user_id": user_id,
                "vacation_id": vacation.id,
                "details": {
                    "start_date": str(start_date),
                    "end_date": str(end_date),
                    "vacation_type": vacation_type,
                    "days_count": days_count,
                    "order_id": order.id,
                    "order_number": order.order_number,
                },
            },
        )

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
            "order_id": vacation.order_id,
            "order_number": order.order_number,
        }

    async def update_vacation(self, db: AsyncSession, id: int, data: dict, user_id: str) -> dict:
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
            raise VacationOverlapError(f"Пересекается с отпуском с {overlap.start_date} по {overlap.end_date}")

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

        employee_repo = EmployeeRepository()
        employee = await employee_repo.get_by_id(db, vacation.employee_id)

        if employee and employee.hire_date:
            await vacation_period_service.ensure_periods_for_employee(
                db,
                vacation.employee_id,
                employee.hire_date,
                employee.additional_vacation_days or 0,
            )

        existing_order = await order_service.get_by_id(db, vacation.order_id) if vacation.order_id else None
        updated = await vacation_repository.update(db, id, update_data)

        recreated_order = None
        if existing_order:
            await order_service.hard_delete_order(db, existing_order.id)
            recreated_order = await self._create_linked_order(
                db,
                updated.employee_id,
                {
                    "start_date": updated.start_date,
                    "end_date": updated.end_date,
                    "vacation_type": updated.vacation_type,
                    "comment": updated.comment,
                    "order_date": existing_order.order_date,
                    "order_number": existing_order.order_number,
                },
                updated.days_count,
            )
            updated = await vacation_repository.update(db, id, {"order_id": recreated_order.id})

        await db.commit()

        audit_logger.info(
            f"VACATION UPDATED: id={updated.id}, employee_id={updated.employee_id}, "
            f"employee_name={employee.name if employee else None}, start={updated.start_date}, "
            f"end={updated.end_date}, type={updated.vacation_type}, days={updated.days_count}",
            extra={
                "employee_id": updated.employee_id,
                "employee_name": employee.name if employee else None,
                "action": "vacation_updated",
                "user_id": user_id,
                "vacation_id": updated.id,
                "details": {
                    "start_date": str(updated.start_date),
                    "end_date": str(updated.end_date),
                    "vacation_type": updated.vacation_type,
                    "days_count": updated.days_count,
                    "order_id": updated.order_id,
                    "order_number": recreated_order.order_number if recreated_order else existing_order.order_number if existing_order else None,
                },
            },
        )

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
            "order_id": updated.order_id,
            "order_number": recreated_order.order_number if recreated_order else existing_order.order_number if existing_order else None,
        }

    async def delete_vacation(self, db: AsyncSession, id: int, user_id: str) -> bool:
        vacation = await vacation_repository.get_by_id(db, id)
        if not vacation:
            raise VacationNotFoundError(id)

        employee_repo = EmployeeRepository()
        employee = await employee_repo.get_by_id(db, vacation.employee_id)

        await vacation_repository.hard_delete(db, id)

        if vacation.order_id:
            await order_service.hard_delete_order(db, vacation.order_id)

        # Полностью пересчитываем периоды после удаления отпуска
        await vacation_period_service.recalculate_periods(db, vacation.employee_id)

        audit_logger.info(
            f"VACATION DELETED: id={id}, employee_id={vacation.employee_id}, "
            f"employee_name={employee.name if employee else None}",
            extra={
                "employee_id": vacation.employee_id,
                "employee_name": employee.name if employee else None,
                "action": "vacation_deleted",
                "user_id": user_id,
                "vacation_id": id,
            },
        )

        return True

    async def cancel_vacation(self, db: AsyncSession, id: int, user_id: str) -> bool:
        vacation = await vacation_repository.get_by_id(db, id)
        if not vacation:
            raise VacationNotFoundError(id)

        if vacation.order_id:
            await order_service.cancel_order(db, vacation.order_id, user_id)

        result = await vacation_repository.cancel(db, id, user_id)
        await db.commit()
        return result

    async def get_vacation_balance(self, db: AsyncSession, employee_id: int, year: Optional[int] = None) -> dict:
        employee = await EmployeeRepository().get_by_id(db, employee_id)
        if employee and employee.hire_date:
            await vacation_period_service.ensure_periods_for_employee(
                db,
                employee_id,
                employee.hire_date,
                employee.additional_vacation_days or 0,
            )
        return await vacation_repository.get_vacation_balance(db, employee_id, year)

    async def get_employees_summary(
        self,
        db: AsyncSession,
        q: Optional[str] = None,
        archive_filter: str = "active",
    ) -> List[Dict[str, Any]]:
        return await vacation_repository.get_employees_summary(db, q=q, archive_filter=archive_filter)

    async def get_employee_vacation_history(self, db: AsyncSession, employee_id: int) -> Dict[str, Any]:
        return await vacation_repository.get_employee_vacation_history(db, employee_id)


vacation_service = VacationService()
