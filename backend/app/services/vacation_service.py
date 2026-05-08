from datetime import date, timedelta
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
from app.repositories.vacation_adjustment_repository import vacation_adjustment_repository
from app.repositories.vacation_period_repository import VacationPeriodRepository
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
                draft_id=vacation_data.get("draft_id"),
            ),
        )

    async def _calculate_actual_days(self, db: AsyncSession, start_date: date, end_date: date) -> int:
        if end_date < start_date:
            return 0
        holidays = await references_repository.get_holidays_for_year(db, start_date.year)
        if end_date.year != start_date.year:
            holidays += await references_repository.get_holidays_for_year(db, end_date.year)
        holidays_count = count_holidays_in_range(holidays, start_date, end_date)
        return calculate_vacation_days(start_date, end_date, holidays_count)

    async def reverse_vacation_auto_transactions(
        self,
        db: AsyncSession,
        *,
        vacation_id: int,
        adjustment_id: int,
        adjustment_order_id: int,
        adjustment_order_number: str | None,
        original_order_id: int,
    ) -> None:
        tx_repo = VacationPeriodRepository()
        original_transactions = await tx_repo.get_active_auto_transactions_by_vacation(db, vacation_id)
        for tx in original_transactions:
            await tx_repo.add_transaction(
                db,
                period_id=tx.period_id,
                days_count=-tx.days_count,
                transaction_type="vacation_restore",
                order_id=adjustment_order_id,
                order_number=adjustment_order_number,
                vacation_id=vacation_id,
                original_order_id=original_order_id,
                adjustment_order_id=adjustment_order_id,
                adjustment_id=adjustment_id,
                reversed_transaction_id=tx.id,
                is_reversal=True,
                source_type="vacation_adjustment",
                metadata={"original_transaction_id": tx.id},
                description="Сторно списания по корректировке отпуска",
                recompute_totals=True,
            )

    async def reapply_vacation_days(
        self,
        db: AsyncSession,
        *,
        employee,
        vacation,
        actual_days: int,
        adjustment_id: int,
        adjustment_order_id: int,
        order_number: str | None,
    ) -> None:
        if actual_days <= 0:
            return
        await auto_use_days(
            db=db,
            employee_id=vacation.employee_id,
            days_to_use=actual_days,
            hire_date=employee.hire_date,
            additional_days=employee.additional_vacation_days or 0,
            order_id=vacation.order_id,
            order_number=order_number,
            vacation_id=vacation.id,
            transaction_type="vacation_use_adjusted",
            original_order_id=vacation.order_id,
            adjustment_order_id=adjustment_order_id,
            adjustment_id=adjustment_id,
            is_recalc=False,
        )

    async def apply_vacation_adjustment(
        self,
        db: AsyncSession,
        *,
        vacation_id: int,
        adjustment_order_id: int,
        adjustment_type: str,
        actual_start_date: date | None,
        actual_end_date: date | None,
        actual_days: int,
        reason: str | None,
    ):
        vacation = await vacation_repository.get_by_id(db, vacation_id)
        if not vacation:
            raise VacationNotFoundError(vacation_id)
        if not vacation.order_id:
            raise InsufficientVacationDaysError("У отпуска нет исходного приказа")

        existing = await vacation_adjustment_repository.get_by_vacation_and_order(
            db,
            vacation_id=vacation_id,
            adjustment_order_id=adjustment_order_id,
        )
        if existing:
            return existing

        employee = await EmployeeRepository().get_by_id(db, vacation.employee_id)
        if not employee:
            raise EmployeeNotFoundError(vacation.employee_id)

        adjustment = await vacation_adjustment_repository.create(
            db,
            {
                "vacation_id": vacation.id,
                "employee_id": vacation.employee_id,
                "adjustment_type": adjustment_type,
                "original_order_id": vacation.order_id,
                "adjustment_order_id": adjustment_order_id,
                "original_start_date": vacation.start_date,
                "original_end_date": vacation.end_date,
                "actual_start_date": actual_start_date,
                "actual_end_date": actual_end_date,
                "original_days": vacation.days_count,
                "actual_days": actual_days,
                "days_delta": actual_days - vacation.days_count,
                "days_returned": max(vacation.days_count - actual_days, 0),
                "days_added": max(actual_days - vacation.days_count, 0),
                "reason": reason,
            },
        )

        adjustment_order = await order_service.get_by_id(db, adjustment_order_id)
        await self.reverse_vacation_auto_transactions(
            db,
            vacation_id=vacation.id,
            adjustment_id=adjustment.id,
            adjustment_order_id=adjustment_order_id,
            adjustment_order_number=adjustment_order.order_number if adjustment_order else None,
            original_order_id=vacation.order_id,
        )

        order = await order_service.get_by_id(db, vacation.order_id)
        await self.reapply_vacation_days(
            db,
            employee=employee,
            vacation=vacation,
            actual_days=actual_days,
            adjustment_id=adjustment.id,
            adjustment_order_id=adjustment_order_id,
            order_number=order.order_number if order else None,
        )
        return adjustment

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
            db,
            employee_id,
            days_count,
            employee.hire_date,
            employee.additional_vacation_days or 0,
            order.id,
            order.order_number,
            vacation_id=vacation.id,
            transaction_type="vacation_use",
            original_order_id=order.id,
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
            # Сначала создаём новый приказ, затем обновляем order_id у отпуска,
            # и только потом удаляем старый приказ — чтобы CASCADE не удалил отпуск
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
            await order_service.hard_delete_order(db, existing_order.id)

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

        # Если отпуск связан с приказом — делегируем удаление приказа
        # hard_delete_order сам удалит все связанные отпуска и пересчитает периоды
        if vacation.order_id:
            await order_service.hard_delete_order(db, vacation.order_id)
        else:
            # Удаляем только отпуск и пересчитываем периоды
            await vacation_repository.hard_delete(db, id)
            await vacation_period_service.recalculate_periods(db, vacation.employee_id)
            await db.commit()

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

    async def recall_vacation(self, db: AsyncSession, vacation_id: int, data: dict, user_id: str) -> dict:
        vacation = await vacation_repository.get_by_id(db, vacation_id)
        if not vacation:
            raise VacationNotFoundError(vacation_id)

        recall_date = data["recall_date"]
        if recall_date < vacation.start_date:
            raise InsufficientVacationDaysError("Дата отзыва раньше даты начала отпуска")
        if recall_date >= vacation.end_date:
            raise InsufficientVacationDaysError("Дата отзыва должна быть раньше даты окончания отпуска")
        if recall_date <= vacation.start_date:
            raise InsufficientVacationDaysError("Дата отзыва должна быть позже даты начала отпуска")

        employee_repo = EmployeeRepository()
        employee = await employee_repo.get_by_id(db, vacation.employee_id)
        if not employee:
            raise EmployeeNotFoundError(vacation.employee_id)

        new_end_date = recall_date - timedelta(days=1)
        new_days_count = await self._calculate_actual_days(db, vacation.start_date, new_end_date)

        if new_days_count <= 0:
            raise InsufficientVacationDaysError("Нет дней отпуска в выбранном диапазоне")

        old_end_date = vacation.end_date
        old_days_count = vacation.days_count

        order_type = await order_service.get_order_type_by_code(db, "vacation_recall")
        order_payload = OrderCreate(
            employee_id=vacation.employee_id,
            order_type_id=order_type.id,
            order_date=data["order_date"],
            order_number=data.get("order_number"),
            notes=data.get("comment"),
            extra_fields={
                "recall_date": recall_date.isoformat(),
                "old_vacation_start": vacation.start_date.isoformat(),
                "old_vacation_end": old_end_date.isoformat(),
                "old_vacation_days": old_days_count,
                "actual_days_used": new_days_count,
                "days_returned": old_days_count - new_days_count,
                "reason": data.get("reason", ""),
            },
            preview_id=data.get("preview_id"),
            edited_html=data.get("edited_html"),
            draft_id=data.get("draft_id"),
        )
        recall_order = await order_service.create_order(db, order_payload)

        await self.apply_vacation_adjustment(
            db,
            vacation_id=vacation_id,
            adjustment_order_id=recall_order.id,
            adjustment_type="recall",
            actual_start_date=vacation.start_date,
            actual_end_date=new_end_date,
            actual_days=new_days_count,
            reason=data.get("comment"),
        )

        await vacation_repository.update(
            db,
            vacation_id,
            {
                "is_recalled": True,
                "recall_date": recall_date,
                "recall_order_id": recall_order.id,
            },
        )

        updated_vacation = await vacation_repository.get_by_id(db, vacation_id)
        await db.commit()

        audit_logger.info(
            f"VACATION RECALLED: id={vacation_id}, employee_id={vacation.employee_id}, "
            f"employee_name={employee.name}, old_end={old_end_date}, recall_date={recall_date}, "
            f"old_days={old_days_count}, new_days={new_days_count}, order_id={recall_order.id}",
            extra={
                "employee_id": vacation.employee_id,
                "employee_name": employee.name,
                "action": "vacation_recalled",
                "user_id": user_id,
                "vacation_id": vacation_id,
                "order_id": recall_order.id,
                "details": {
                    "original_end_date": str(old_end_date),
                    "recall_date": str(recall_date),
                    "original_days_count": old_days_count,
                    "actual_days_used": new_days_count,
                    "days_returned": old_days_count - new_days_count,
                    "recall_order_number": recall_order.order_number,
                },
            },
        )

        return {
            "id": updated_vacation.id,
            "employee_id": updated_vacation.employee_id,
            "employee_name": employee.name,
            "start_date": str(updated_vacation.start_date),
            "end_date": str(updated_vacation.end_date),
            "days_count": updated_vacation.days_count,
            "old_days_count": old_days_count,
            "order_id": updated_vacation.order_id,
            "order_number": getattr(updated_vacation, "order", None) and updated_vacation.order.order_number,
            "recall_order_id": recall_order.id,
            "recall_order_number": recall_order.order_number,
        }

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

    async def extend_vacation(self, db: AsyncSession, vacation_id: int, data: dict, user_id: str) -> dict:
        vacation = await vacation_repository.get_by_id(db, vacation_id)
        if not vacation:
            raise VacationNotFoundError(vacation_id)

        sick_start = data["sick_start_date"]
        sick_end = data["sick_end_date"]

        # Новый основной сценарий: пользователь указывает сам период продления.
        extension_period_start = data.get("start_date")
        extension_period_end = data.get("end_date")

        if extension_period_start and extension_period_end:
            if extension_period_end < extension_period_start:
                raise InsufficientVacationDaysError("Дата конца периода продления раньше даты начала")
            if extension_period_start <= vacation.end_date:
                raise InsufficientVacationDaysError("Период продления должен начинаться после окончания отпуска")
        else:
            # Backward compatibility: если период продления не передан,
            # считаем длительность по больничному и начинаем на следующий день после отпуска.
            if sick_start > sick_end:
                raise InsufficientVacationDaysError("Дата конца больничного раньше даты начала")
            extension_period_start = vacation.end_date + timedelta(days=1)
            extension_days_legacy = (sick_end - sick_start).days + 1
            extension_period_end = extension_period_start + timedelta(days=max(extension_days_legacy - 1, 0))

        employee_repo = EmployeeRepository()
        employee = await employee_repo.get_by_id(db, vacation.employee_id)
        if not employee:
            raise EmployeeNotFoundError(vacation.employee_id)

        extension_days = (extension_period_end - extension_period_start).days + 1
        new_end_date = extension_period_end
        # Ключевое правило продления из-за нетрудоспособности:
        # продленные дни не увеличивают расход дней отпуска.
        actual_days_after_extension = vacation.days_count

        order_type = await order_service.get_order_type_by_code(db, "vacation_extension")
        order_payload = OrderCreate(
            employee_id=vacation.employee_id,
            order_type_id=order_type.id,
            order_date=data["order_date"],
            order_number=data.get("order_number"),
            notes=data.get("comment"),
            extra_fields={
                "vacation_start": vacation.start_date.isoformat(),
                "vacation_end": vacation.end_date.isoformat(),
                "extension_period_start": extension_period_start.isoformat(),
                "extension_period_end": extension_period_end.isoformat(),
                "vacation_days": vacation.days_count,
                "sick_start_date": sick_start.isoformat(),
                "sick_end_date": sick_end.isoformat(),
                "extension_days": extension_days,
                "comment": data.get("comment", ""),
            },
            preview_id=data.get("preview_id"),
            edited_html=data.get("edited_html"),
            draft_id=data.get("draft_id"),
        )
        extension_order = await order_service.create_order(db, order_payload)

        await self.apply_vacation_adjustment(
            db,
            vacation_id=vacation_id,
            adjustment_order_id=extension_order.id,
            adjustment_type="extension",
            actual_start_date=vacation.start_date,
            actual_end_date=new_end_date,
            actual_days=actual_days_after_extension,
            reason=data.get("comment"),
        )

        auto_comment = (
            f"Продление по приказу №{extension_order.order_number or '—'}: "
            f"период {vacation.start_date.isoformat()} — {vacation.end_date.isoformat()}, "
            f"продленный период {extension_period_start.isoformat()} — {extension_period_end.isoformat()}, "
            f"было {vacation.days_count} дн., стало {actual_days_after_extension} дн., продлено {extension_days} дн."
        )
        user_comment = (data.get("comment") or "").strip()
        existing_comment = (vacation.comment or "").strip()
        comment_parts = [part for part in [existing_comment, user_comment, auto_comment] if part]
        merged_comment = "\n".join(comment_parts) if comment_parts else None

        await vacation_repository.update(
            db, vacation_id, {
                "is_extended": True,
                "extension_order_id": extension_order.id,
                "comment": merged_comment,
            }
        )

        updated_vacation = await vacation_repository.get_by_id(db, vacation_id)
        await db.commit()

        audit_logger.info(
            f"VACATION EXTENDED: id={vacation.id}, employee_id={vacation.employee_id}, "
            f"employee_name={employee.name}, old_end={vacation.end_date}, new_end={new_end_date}, "
            f"days_count={actual_days_after_extension}, extension_days={extension_days}, order_id={extension_order.id}",
            extra={
                "employee_id": vacation.employee_id,
                "employee_name": employee.name,
                "action": "vacation_extended",
                "user_id": user_id,
                "vacation_id": vacation.id,
                "order_id": extension_order.id,
                "details": {
                    "old_end_date": str(vacation.end_date),
                    "new_end_date": str(new_end_date),
                    "days_count": actual_days_after_extension,
                    "extension_period_start": str(extension_period_start),
                    "extension_period_end": str(extension_period_end),
                    "sick_start_date": str(sick_start),
                    "sick_end_date": str(sick_end),
                    "extension_days": extension_days,
                    "extension_order_number": extension_order.order_number,
                },
            },
        )

        return {
            "id": updated_vacation.id,
            "employee_id": updated_vacation.employee_id,
            "employee_name": employee.name,
            "start_date": str(updated_vacation.start_date),
            "end_date": str(updated_vacation.end_date),
            "days_count": updated_vacation.days_count,
            "order_id": updated_vacation.order_id,
            "order_number": vacation.order.order_number if getattr(vacation, "order", None) else None,
            "extension_order_id": extension_order.id,
            "extension_order_number": extension_order.order_number,
        }

    async def postpone_vacation(self, db: AsyncSession, vacation_id: int, data: dict, user_id: str) -> dict:
        vacation = await vacation_repository.get_by_id(db, vacation_id)
        if not vacation:
            raise VacationNotFoundError(vacation_id)

        # Если указаны start_date/end_date - используем их, иначе весь отпуск
        range_start = data.get("start_date") or vacation.start_date
        range_end = data.get("end_date") or vacation.end_date

        if range_start < vacation.start_date or range_end > vacation.end_date:
            raise InsufficientVacationDaysError("Выбранный диапазон выходит за пределы отпуска")

        if range_start > range_end:
            raise InsufficientVacationDaysError("Дата конца диапазона раньше даты начала")

        # Ключевое правило: дни переноса считаются по выбранному диапазону, а не берутся из ручного ввода.
        postponed_days = await self._calculate_actual_days(db, range_start, range_end)
        requested_postponed_days = data.get("postponed_days")
        if requested_postponed_days is not None and requested_postponed_days != postponed_days:
            audit_logger.warning(
                "Несовпадение дней переноса: в запросе=%s, рассчитано=%s, vacation_id=%s",
                requested_postponed_days,
                postponed_days,
                vacation_id,
            )

        if postponed_days <= 0:
            raise InsufficientVacationDaysError("Количество дней для переноса должно быть больше 0")

        if postponed_days >= vacation.days_count:
            raise InsufficientVacationDaysError(
                f"Количество дней для переноса ({postponed_days}) не может быть больше или равно количеству дней отпуска ({vacation.days_count})"
            )

        employee_repo = EmployeeRepository()
        employee = await employee_repo.get_by_id(db, vacation.employee_id)
        if not employee:
            raise EmployeeNotFoundError(vacation.employee_id)

        used_days = vacation.days_count - postponed_days

        order_type = await order_service.get_order_type_by_code(db, "vacation_postpone")
        order_payload = OrderCreate(
            employee_id=vacation.employee_id,
            order_type_id=order_type.id,
            order_date=data["order_date"],
            order_number=data.get("order_number"),
            notes=data.get("comment"),
            extra_fields={
                "old_vacation_start": vacation.start_date.isoformat(),
                "old_vacation_end": vacation.end_date.isoformat(),
                "postpone_range_start": range_start.isoformat() if range_start != vacation.start_date else None,
                "postpone_range_end": range_end.isoformat() if range_end != vacation.end_date else None,
                "old_vacation_days": vacation.days_count,
                "used_days": used_days,
                "postponed_days": postponed_days,
                "reason": data.get("comment", ""),
            },
            preview_id=data.get("preview_id"),
            edited_html=data.get("edited_html"),
            draft_id=data.get("draft_id"),
        )
        postpone_order = await order_service.create_order(db, order_payload)

        await self.apply_vacation_adjustment(
            db,
            vacation_id=vacation_id,
            adjustment_order_id=postpone_order.id,
            adjustment_type="postpone",
            actual_start_date=vacation.start_date,
            actual_end_date=vacation.end_date,
            actual_days=used_days,
            reason=data.get("comment"),
        )

        auto_comment = (
            f"Перенос по приказу №{postpone_order.order_number or '—'}: "
            f"период {range_start.isoformat()} — {range_end.isoformat()}, "
            f"было {vacation.days_count} дн., стало {used_days} дн., перенесено {postponed_days} дн."
        )
        user_comment = (data.get("comment") or "").strip()
        existing_comment = (vacation.comment or "").strip()
        comment_parts = [part for part in [existing_comment, user_comment, auto_comment] if part]
        merged_comment = "\n".join(comment_parts) if comment_parts else None

        await vacation_repository.update(
            db, vacation_id, {
                "is_postponed": True,
                "postpone_order_id": postpone_order.id,
                "comment": merged_comment,
            }
        )

        updated_vacation = await vacation_repository.get_by_id(db, vacation_id)
        await db.commit()

        audit_logger.info(
            f"VACATION POSTPONED: id={vacation.id}, employee_id={vacation.employee_id}, "
            f"employee_name={employee.name}, total_days={vacation.days_count}, "
            f"used_days={used_days}, postponed_days={postponed_days}, order_id={postpone_order.id}",
            extra={
                "employee_id": vacation.employee_id,
                "employee_name": employee.name,
                "action": "vacation_postponed",
                "user_id": user_id,
                "vacation_id": vacation.id,
                "order_id": postpone_order.id,
                "details": {
                    "vacation_start": str(vacation.start_date),
                    "vacation_end": str(vacation.end_date),
                    "postpone_range_start": str(range_start),
                    "postpone_range_end": str(range_end),
                    "total_days": vacation.days_count,
                    "used_days": used_days,
                    "postponed_days": postponed_days,
                    "postpone_order_number": postpone_order.order_number,
                },
            },
        )

        return {
            "id": updated_vacation.id,
            "employee_id": updated_vacation.employee_id,
            "employee_name": employee.name,
            "start_date": str(updated_vacation.start_date),
            "end_date": str(updated_vacation.end_date),
            "days_count": updated_vacation.days_count,
            "order_id": updated_vacation.order_id,
            "order_number": updated_vacation.order.order_number if getattr(updated_vacation, "order", None) else None,
            "postpone_order_id": postpone_order.id,
            "postpone_order_number": postpone_order.order_number,
            "postponed_days": postponed_days,
        }


vacation_service = VacationService()
