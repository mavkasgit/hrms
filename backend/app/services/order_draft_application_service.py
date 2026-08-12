"""Application service создания черновиков приказов (ADR-0008, #97).

Подготовка создания черновика перенесена из HTTP-роутера `/orders/drafts`
и `/orders/group-drafts`: загрузка employee, валидация активного order_type,
генерация номера, нормализация vacation/transfer полей и сборка group payload.
Роутер конструирует `Create*DraftCommand` из запроса и вызывает сервис.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import EmployeeNotFoundError, HRMSException
from app.repositories.references_repository import references_repository
from app.schemas.order import GroupOrderCreate, OrderCreate
from app.services.order_draft_service import order_draft_service
from app.services.order_service import order_service
from app.utils.working_days import calculate_vacation_days, count_holidays_in_range


@dataclass(frozen=True)
class CreateOrderDraftCommand:
    """Команда создания одиночного черновика приказа."""

    data: OrderCreate
    user_id: str = "system"


@dataclass(frozen=True)
class CreateGroupOrderDraftCommand:
    """Команда создания группового черновика приказа."""

    data: GroupOrderCreate
    user_id: str = "system"


class OrderDraftApplicationService:
    """Application-слой создания черновиков приказов (single + group)."""

    async def create_draft(self, db: AsyncSession, command: CreateOrderDraftCommand) -> dict[str, Any]:
        await order_service.ensure_default_order_types(db)

        data = command.data
        employee = None
        if data.employee_id is not None:
            employee = await order_service.get_employee_by_id(db, data.employee_id)
            if not employee:
                raise EmployeeNotFoundError(data.employee_id)

        order_type = await order_service.get_order_type_by_id(db, data.order_type_id)
        if not order_type or not order_type.is_active:
            raise HRMSException("Активный тип приказа не найден", "order_type_not_found", status_code=404)

        if not data.order_number:
            order_number = await order_service.get_next_number(db, data.order_type_id)
            data = data.model_copy(update={"order_number": order_number})

        data = await self._normalize_vacation_draft_fields(db, data, order_type.code)
        data = await self._normalize_transfer_draft_fields(db, data, order_type.code)

        return await order_draft_service.create_draft(data, employee, order_type, user_id=command.user_id)

    async def create_group_draft(self, db: AsyncSession, command: CreateGroupOrderDraftCommand) -> dict[str, Any]:
        await order_service.ensure_default_order_types(db)

        data = command.data
        order_type = await order_service.get_order_type_by_code(db, data.order_type_code)
        if not order_type or not order_type.is_active:
            raise HRMSException("Активный тип приказа не найден", "order_type_not_found", status_code=404)

        # Load employees and attach to payload for rendering
        employees_with_objs = []
        for emp_item in data.employees:
            employee = await order_service.get_employee_by_id(db, emp_item["employee_id"])
            if not employee:
                raise EmployeeNotFoundError(emp_item["employee_id"])
            employees_with_objs.append({
                "employee_id": emp_item["employee_id"],
                "vacation_days": emp_item["vacation_days"],
                "employee": employee,
            })

        payload = data.model_dump(exclude_unset=True)
        payload["employees"] = employees_with_objs

        return await order_draft_service.create_group_draft(
            order_type_code=data.order_type_code,
            payload=payload,
            order_type=order_type,
            user_id=command.user_id,
        )

    # === Нормализация доменных полей ===

    async def _normalize_vacation_draft_fields(
        self, db: AsyncSession, data: OrderCreate, order_type_code: str
    ) -> OrderCreate:
        if order_type_code not in {"vacation_paid", "vacation_unpaid"} or not data.extra_fields:
            return data
        start_raw = data.extra_fields.get("vacation_start")
        end_raw = data.extra_fields.get("vacation_end")
        if not isinstance(start_raw, str) or not isinstance(end_raw, str):
            return data
        try:
            start = date.fromisoformat(start_raw)
            end = date.fromisoformat(end_raw)
        except (ValueError, TypeError):
            return data

        holidays = await references_repository.get_holidays_for_year(db, start.year)
        if end.year != start.year:
            holidays += await references_repository.get_holidays_for_year(db, end.year)
        days_count = calculate_vacation_days(start, end, count_holidays_in_range(holidays, start, end))
        extra_fields = {**data.extra_fields, "vacation_days": days_count}
        return data.model_copy(update={"extra_fields": extra_fields})

    async def _normalize_transfer_draft_fields(
        self, db: AsyncSession, data: OrderCreate, order_type_code: str
    ) -> OrderCreate:
        """Resolve new_position_name from new_position id for transfer orders."""
        if order_type_code != "transfer" or not data.extra_fields:
            return data
        new_position_id = data.extra_fields.get("new_position")
        if not new_position_id:
            return data
        if isinstance(new_position_id, str) and new_position_id.isdigit():
            new_position_id = int(new_position_id)
        if not isinstance(new_position_id, int):
            return data
        from app.models.position import Position
        from sqlalchemy import select

        result = await db.execute(select(Position).where(Position.id == new_position_id))
        position = result.scalar_one_or_none()
        if not position:
            return data
        extra_fields = {**data.extra_fields, "new_position_name": position.name}
        return data.model_copy(update={"extra_fields": extra_fields})


order_draft_application_service = OrderDraftApplicationService()
