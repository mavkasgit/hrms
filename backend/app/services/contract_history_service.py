from datetime import date
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.contract_history import ContractHistory
from app.models.employee import Employee


class ContractHistoryService:
    async def record_contract_from_order(
        self,
        db: AsyncSession,
        employee_id: int,
        order_id: int,
        order_type_code: str,
        extra_fields: Optional[dict[str, Any]],
        employee: Optional[Employee],
    ) -> ContractHistory:
        """Create a contract history record from order data."""
        ef = extra_fields or {}

        contract_start = self._parse_date(
            ef.get("new_contract_start")
            or ef.get("hire_date")
            or ef.get("contract_start")
        )
        contract_end = self._parse_date(
            ef.get("new_contract_end")
            or ef.get("contract_end")
        )
        contract_number = (
            ef.get("new_contract_number")
            or ef.get("contract_number")
            or (getattr(employee, "contract_number", None) if employee else None)
        )
        # Calculate years for order placeholders (not stored in history)
        contract_years = self._parse_int(
            ef.get("new_contract_years")
            or ef.get("contract_end_years")
        )

        record = ContractHistory(
            employee_id=employee_id,
            order_id=order_id,
            contract_number=str(contract_number) if contract_number else None,
            contract_start=contract_start or date.today(),
            contract_end=contract_end,
            order_type_code=order_type_code,
            old_position=employee.position.name if employee and employee.position else None,
            new_position=ef.get("new_position_name"),
        )
        db.add(record)
        await db.flush()
        return record

    async def get_by_employee(self, db: AsyncSession, employee_id: int) -> list[ContractHistory]:
        """Get all contract history records for an employee, newest first."""
        result = await db.execute(
            select(ContractHistory)
            .options(selectinload(ContractHistory.order))
            .where(ContractHistory.employee_id == employee_id)
            .order_by(ContractHistory.contract_start.desc())
        )
        return list(result.scalars().all())

    async def get_by_order(self, db: AsyncSession, order_id: int) -> list[ContractHistory]:
        """Get contract history records linked to a specific order."""
        result = await db.execute(
            select(ContractHistory)
            .where(ContractHistory.order_id == order_id)
        )
        return list(result.scalars().all())

    async def delete_by_order(self, db: AsyncSession, order_id: int) -> None:
        """Delete all contract history records linked to an order."""
        from sqlalchemy import delete as sa_delete
        await db.execute(
            sa_delete(ContractHistory).where(ContractHistory.order_id == order_id)
        )
        await db.flush()

    @staticmethod
    def _parse_date(value: Any) -> date | None:
        if value is None:
            return None
        if isinstance(value, date):
            return value
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return None
            from datetime import datetime
            for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
                try:
                    return datetime.strptime(raw, fmt).date()
                except ValueError:
                    continue
        return None

    @staticmethod
    def _parse_int(value: Any) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None

contract_history_service = ContractHistoryService()
