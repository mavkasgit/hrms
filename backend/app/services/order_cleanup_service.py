from datetime import date

from sqlalchemy import delete as sa_delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import OrderNotFoundError
from app.core.logging import get_audit_logger
from app.core.paths import storage_path
from app.models.order import Order
from app.models.vacation import Vacation
from app.models.vacation_adjustment import VacationAdjustment
from app.models.vacation_period_manual_closure import VacationPeriodManualClosure
from app.models.vacation_period_transaction import VacationPeriodTransaction
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.order_repository import OrderRepository

audit_logger = get_audit_logger()


class OrderCleanupService:
    def __init__(self):
        self.order_repo = OrderRepository()
        self.employee_repo = EmployeeRepository()

    def _clean_vacation_comment(self, comment: str | None, order_number: str | None) -> str | None:
        if not comment:
            return comment
        
        lines = comment.split("\n")
        cleaned_lines = []
        
        order_suffixes = []
        if order_number:
            order_suffixes.append(f"№{order_number}")
        order_suffixes.append("№—")
        
        for line in lines:
            should_skip = False
            for suffix in order_suffixes:
                if (line.startswith("Перенос по приказу") or line.startswith("Продление по приказу")) and suffix in line:
                    should_skip = True
                    break
            if not should_skip:
                cleaned_lines.append(line)
                
        if not cleaned_lines:
            return None
        return "\n".join(cleaned_lines)

    async def hard_delete_order(self, db: AsyncSession, order_id: int) -> bool:
        order = await self.order_repo.get_by_id(db, order_id)
        if not order:
            raise OrderNotFoundError(order_id)

        employee = await self.employee_repo.get_by_id(db, order.employee_id)

        # Get order type code
        order_type_code = order.order_type.code if getattr(order, "order_type", None) else None
        if not order_type_code:
            from sqlalchemy import select as _select
            from app.models.order_type import OrderType as _OrderType
            type_result = await db.execute(
                _select(_OrderType.code).where(_OrderType.id == order.order_type_id)
            )
            order_type_code = type_result.scalar_one_or_none()

        # Restore employee on dismissal order deletion
        if order_type_code == "dismissal" and employee and employee.is_dismissed:
            employee.is_dismissed = False
            employee.dismissal_date = None
            employee.dismissal_reason = None
            employee.dismissed_by = None
            employee.dismissed_at = None
            await db.flush()

        # Restore contract_end on contract_extension order deletion
        if order_type_code == "contract_extension" and employee and order.extra_fields and order.extra_fields.get("old_contract_end"):
            employee.contract_end = date.fromisoformat(order.extra_fields["old_contract_end"])
            await db.flush()

        # Restore contract_end on transfer order deletion
        if order_type_code == "transfer" and employee and order.extra_fields:
            if order.extra_fields.get("old_contract_end"):
                employee.contract_end = date.fromisoformat(order.extra_fields["old_contract_end"])
            else:
                # If no old contract existed, clear the new one
                employee.contract_end = None
            await db.flush()

        # Restore contract_start on transfer order deletion
        if order_type_code == "transfer" and employee and order.extra_fields:
            if order.extra_fields.get("old_contract_start"):
                employee.contract_start = date.fromisoformat(order.extra_fields["old_contract_start"])
            else:
                # If no old contract existed, clear the new one
                employee.contract_start = None
            await db.flush()

        # Restore position on transfer order deletion
        if order_type_code == "transfer" and employee and order.extra_fields and order.extra_fields.get("old_position_id"):
            employee.position_id = order.extra_fields["old_position_id"]
            await db.flush()

        # Restore contract_number on contract-related order deletion
        if order_type_code in ("hire", "contract_extension", "new_contract", "transfer") and employee and order.extra_fields:
            if order.extra_fields.get("old_contract_number"):
                employee.contract_number = order.extra_fields["old_contract_number"]
            elif order_type_code == "transfer":
                # If no old contract existed, clear the new one
                employee.contract_number = None
            await db.flush()

        # Delete contract history records linked to this order
        from app.services.contract_history_service import contract_history_service
        await contract_history_service.delete_by_order(db, order_id)

        # Get affected period IDs before deletion
        from app.services.vacation_period_service import vacation_period_service

        affected_period_ids = await vacation_period_service.get_affected_period_ids_for_order(db, order_id)

        # Clean up dependent entities explicitly

        # 1. Находим manual closure IDs для этого приказа
        closure_ids_result = await db.execute(
            select(VacationPeriodManualClosure.id).where(VacationPeriodManualClosure.order_id == order_id)
        )
        closure_ids = [row[0] for row in closure_ids_result.all()]

        # 2. Находим все транзакции, подлежащие удалению
        tx_ids_result = await db.execute(
            select(VacationPeriodTransaction.id).where(
                or_(
                    VacationPeriodTransaction.original_order_id == order_id,
                    VacationPeriodTransaction.adjustment_order_id == order_id,
                    VacationPeriodTransaction.manual_closure_id.in_(closure_ids) if closure_ids else False,
                )
            )
        )
        tx_ids = [row[0] for row in tx_ids_result.all()]

        # 3. Сбрасываем reversed_transaction_id для транзакций, которые ссылаются на удаляемые транзакции
        if tx_ids:
            await db.execute(
                update(VacationPeriodTransaction)
                .where(VacationPeriodTransaction.reversed_transaction_id.in_(tx_ids))
                .values(reversed_transaction_id=None)
            )
            # 4. Удаляем транзакции
            await db.execute(
                sa_delete(VacationPeriodTransaction).where(VacationPeriodTransaction.id.in_(tx_ids))
            )

        # 5. Разделяем отпуска: те, что созданы приказом (удаляем) и те, что изменены им (обновляем)
        to_delete_result = await db.execute(
            select(Vacation.id).where(Vacation.order_id == order_id)
        )
        to_delete_ids = [row[0] for row in to_delete_result.all()]

        # 6. Находим корректировки, подлежащие удалению
        adj_ids_result = await db.execute(
            select(VacationAdjustment.id).where(
                or_(
                    VacationAdjustment.original_order_id == order_id,
                    VacationAdjustment.adjustment_order_id == order_id,
                    VacationAdjustment.vacation_id.in_(to_delete_ids) if to_delete_ids else False,
                )
            )
        )
        adj_ids = [row[0] for row in adj_ids_result.all()]

        if adj_ids:
            # Сбрасываем adjustment_id в транзакциях
            await db.execute(
                update(VacationPeriodTransaction)
                .where(VacationPeriodTransaction.adjustment_id.in_(adj_ids))
                .values(adjustment_id=None)
            )
            # Удаляем корректировки
            await db.execute(
                sa_delete(VacationAdjustment).where(VacationAdjustment.id.in_(adj_ids))
            )

        # 7. Находим и обновляем отпуска (отмена отзывов/переносов/продлений)
        to_update_result = await db.execute(
            select(Vacation).where(
                or_(
                    Vacation.recall_order_id == order_id,
                    Vacation.postpone_order_id == order_id,
                    Vacation.extension_order_id == order_id,
                )
            )
        )
        to_update_vacations = to_update_result.scalars().all()
        for vac in to_update_vacations:
            if vac.recall_order_id == order_id:
                vac.is_recalled = False
                vac.recall_date = None
                vac.recall_order_id = None
            if vac.postpone_order_id == order_id:
                vac.is_postponed = False
                vac.postpone_order_id = None
                vac.comment = self._clean_vacation_comment(vac.comment, order.order_number)
            if vac.extension_order_id == order_id:
                vac.is_extended = False
                vac.extension_order_id = None
                vac.comment = self._clean_vacation_comment(vac.comment, order.order_number)
        if to_update_vacations:
            await db.flush()

        # 8. Удаляем отпуска, созданные приказом
        if to_delete_ids:
            # Сбрасываем vacation_id в транзакциях для удаляемых отпусков
            await db.execute(
                update(VacationPeriodTransaction)
                .where(VacationPeriodTransaction.vacation_id.in_(to_delete_ids))
                .values(vacation_id=None)
            )
            # Удаляем сами отпуска
            await db.execute(
                sa_delete(Vacation).where(Vacation.id.in_(to_delete_ids))
            )

        # 9. Удаляем manual closures
        if closure_ids:
            await db.execute(
                sa_delete(VacationPeriodManualClosure).where(
                    VacationPeriodManualClosure.id.in_(closure_ids)
                )
            )

        # Delete order file
        if order.file_path:
            try:
                storage_path(order.file_path, "ORDERS_PATH").unlink()
            except OSError:
                pass

        # Delete the order
        await self.order_repo.hard_delete(db, order_id)
        await vacation_period_service.recompute_period_totals_by_ids(db, affected_period_ids)
        await db.commit()

        audit_logger.info(
            f"ORDER DELETED: id={order_id}, number={order.order_number}, type={order.order_type.name if order.order_type else ''}, employee_id={order.employee_id}, employee_name={employee.name if employee else None}",
            extra={"employee_id": order.employee_id, "employee_name": employee.name if employee else None, "action": "order_deleted", "user_id": "system", "order_id": order_id},
        )
        return True
