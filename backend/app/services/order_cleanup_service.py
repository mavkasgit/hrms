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

        # Get affected period IDs before deletion
        from app.services.vacation_period_service import vacation_period_service

        affected_period_ids = await vacation_period_service.get_affected_period_ids_for_order(db, order_id)

        # Clean up dependent entities explicitly
        tx_ids_result = await db.execute(
            select(VacationPeriodTransaction.id).where(
                or_(
                    VacationPeriodTransaction.original_order_id == order_id,
                    VacationPeriodTransaction.adjustment_order_id == order_id,
                )
            )
        )
        tx_ids = [row[0] for row in tx_ids_result.all()]
        if tx_ids:
            await db.execute(
                update(VacationPeriodTransaction)
                .where(VacationPeriodTransaction.reversed_transaction_id.in_(tx_ids))
                .values(reversed_transaction_id=None)
            )
            await db.execute(
                sa_delete(VacationPeriodTransaction).where(VacationPeriodTransaction.id.in_(tx_ids))
            )

        vacation_ids_result = await db.execute(
            select(Vacation.id).where(
                or_(
                    Vacation.order_id == order_id,
                    Vacation.recall_order_id == order_id,
                    Vacation.postpone_order_id == order_id,
                    Vacation.extension_order_id == order_id,
                )
            )
        )
        vacation_ids = [row[0] for row in vacation_ids_result.all()]
        if vacation_ids:
            await db.execute(
                update(VacationPeriodTransaction)
                .where(VacationPeriodTransaction.vacation_id.in_(vacation_ids))
                .values(vacation_id=None)
            )
            await db.execute(sa_delete(Vacation).where(Vacation.id.in_(vacation_ids)))

        await db.execute(
            sa_delete(VacationAdjustment).where(
                or_(
                    VacationAdjustment.original_order_id == order_id,
                    VacationAdjustment.adjustment_order_id == order_id,
                )
            )
        )
        # Сначала удаляем транзакции, ссылающиеся на manual closures этого приказа
        closure_ids_result = await db.execute(
            select(VacationPeriodManualClosure.id).where(VacationPeriodManualClosure.order_id == order_id)
        )
        closure_ids = [row[0] for row in closure_ids_result.all()]
        if closure_ids:
            await db.execute(
                sa_delete(VacationPeriodTransaction).where(
                    VacationPeriodTransaction.manual_closure_id.in_(closure_ids)
                )
            )
        await db.execute(sa_delete(VacationPeriodManualClosure).where(VacationPeriodManualClosure.order_id == order_id))

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
