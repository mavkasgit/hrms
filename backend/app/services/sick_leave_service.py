from datetime import date
from typing import Optional, List, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.sick_leave_repository import SickLeaveRepository
from app.repositories.employee_repository import EmployeeRepository
from app.core.exceptions import (
    EmployeeNotFoundError,
    SickLeaveNotFoundError,
    SickLeaveOverlapError,
    InvalidSickLeaveDatesError,
)
from app.core.logging import get_audit_logger
from app.models.sick_leave import SickLeave, SickLeaveStatus

audit_logger = get_audit_logger()


class SickLeaveService:
    """Сервис для управления больничными листами."""

    def __init__(self):
        self.repo = SickLeaveRepository()
        self.employee_repo = EmployeeRepository()

    async def create_sick_leave(
        self, db: AsyncSession, data: dict, current_user: str
    ) -> Dict[str, Any]:
        """
        Создать запись о больничном.

        Args:
            db: Сессия базы данных
            data: Данные для создания (employee_id, start_date, end_date, comment, ...)
            current_user: Identity автора (username из токена; break-glass —
                emergency_admin вне users). Пишется строкой без lookup (#110).

        Returns:
            dict: Данные созданного больничного
        """
        employee_id = data["employee_id"]
        start_date = data["start_date"]
        end_date = data["end_date"]

        employee = await self.employee_repo.get_by_id(db, employee_id)
        if not employee:
            raise EmployeeNotFoundError(employee_id)

        if end_date < start_date:
            raise InvalidSickLeaveDatesError(
                "Дата окончания не может быть раньше даты начала"
            )

        overlap = await self.repo.check_overlap(db, employee_id, start_date, end_date)
        if overlap:
            raise SickLeaveOverlapError(
                f"Период пересекается с больничным #{overlap.id} "
                f"({overlap.start_date} - {overlap.end_date})"
            )

        days_count = (end_date - start_date).days + 1

        sick_leave = SickLeave(
            employee_id=employee_id,
            start_date=start_date,
            end_date=end_date,
            comment=data.get("comment"),
            status=SickLeaveStatus.ACTIVE,
            created_at=date.today(),
            created_by=current_user,
        )

        created_sick_leave = await self.repo.create(db, sick_leave)

        audit_logger.info(
            "SICK LEAVE CREATED",
            extra={
                "action": "sick_leave_create",
                "entity_type": "sick_leave",
                "entity_id": created_sick_leave.id,
                "performed_by": current_user,
                "changes": {
                    "employee_id": employee_id,
                    "start_date": str(start_date),
                    "end_date": str(end_date),
                    "days_count": days_count,
                },
            },
        )

        return await self._build_response(db, created_sick_leave)

    async def update_sick_leave(
        self, db: AsyncSession, sick_leave_id: int, data: dict, current_user: str
    ) -> Dict[str, Any]:
        """
        Обновить запись о больничном.

        Args:
            db: Сессия базы данных
            sick_leave_id: ID больничного
            data: Данные для обновления
            current_user: Identity автора (username из токена)

        Returns:
            dict: Данные обновленного больничного
        """
        sick_leave = await self.repo.get_by_id(db, sick_leave_id)
        if not sick_leave:
            raise SickLeaveNotFoundError(sick_leave_id)

        new_start_date = data.get("start_date", sick_leave.start_date)
        new_end_date = data.get("end_date", sick_leave.end_date)

        if new_end_date < new_start_date:
            raise InvalidSickLeaveDatesError(
                "Дата окончания не может быть раньше даты начала"
            )

        if (
            new_start_date != sick_leave.start_date
            or new_end_date != sick_leave.end_date
        ):
            overlap = await self.repo.check_overlap(
                db,
                sick_leave.employee_id,
                new_start_date,
                new_end_date,
                exclude_id=sick_leave_id,
            )
            if overlap:
                raise SickLeaveOverlapError(
                    f"Период пересекается с больничным #{overlap.id} "
                    f"({overlap.start_date} - {overlap.end_date})"
                )

        update_data = {}
        for field in ["start_date", "end_date", "comment"]:
            if field in data and data[field] is not None:
                update_data[field] = data[field]

        sick_leave.updated_by = current_user

        updated_sick_leave = await self.repo.update(db, sick_leave, update_data)

        audit_logger.info(
            "SICK LEAVE UPDATED",
            extra={
                "action": "sick_leave_update",
                "entity_type": "sick_leave",
                "entity_id": sick_leave_id,
                "performed_by": current_user,
                "changes": update_data,
            },
        )

        return await self._build_response(db, updated_sick_leave)

    async def delete_sick_leave(
        self, db: AsyncSession, sick_leave_id: int, current_user: str
    ) -> bool:
        """
        Мягко удалить больничный (установить статус DELETED).

        Args:
            db: Сессия базы данных
            sick_leave_id: ID больничного
            current_user: Identity автора (username из токена)

        Returns:
            bool: True если успешно
        """
        sick_leave = await self.repo.get_by_id(db, sick_leave_id)
        if not sick_leave:
            raise SickLeaveNotFoundError(sick_leave_id)

        await self.repo.soft_delete(db, sick_leave, current_user)

        audit_logger.info(
            "SICK LEAVE DELETED",
            extra={
                "action": "sick_leave_delete",
                "entity_type": "sick_leave",
                "entity_id": sick_leave_id,
                "performed_by": current_user,
                "changes": {"status": "deleted"},
            },
        )

        return True

    async def get_sick_leave(
        self, db: AsyncSession, sick_leave_id: int
    ) -> Dict[str, Any]:
        """Получить больничный по ID."""
        sick_leave = await self.repo.get_by_id(db, sick_leave_id)
        if not sick_leave:
            raise SickLeaveNotFoundError(sick_leave_id)

        return await self._build_response(db, sick_leave)

    async def get_sick_leaves_list(
        self,
        db: AsyncSession,
        search_query: Optional[str] = None,
        status: Optional[SickLeaveStatus] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Dict[str, Any]:
        """
        Получить список больничных с пагинацией.

        Returns:
            dict: {"items": [...], "total": int, "page": int, "per_page": int, "pages": int}
        """
        items, total = await self.repo.get_all(
            db=db,
            search_query=search_query,
            status=status,
            page=page,
            per_page=per_page,
        )

        pages = (total + per_page - 1) // per_page if total > 0 else 0

        response_items = []
        for item in items:
            response_items.append(await self._build_response(db, item))

        return {
            "items": response_items,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": pages,
        }

    async def get_employees_summary(
        self,
        db: AsyncSession,
        search_query: Optional[str] = None,
        include_archived: bool = False,
    ) -> List[Dict[str, Any]]:
        """Получить сводку по больничным для всех сотрудников."""
        return await self.repo.get_employees_summary(
            db=db, search_query=search_query, include_archived=include_archived
        )

    async def _build_response(
        self, db: AsyncSession, sick_leave: SickLeave
    ) -> Dict[str, Any]:
        """Построить ответ API с данными о больничном."""
        employee = await self.employee_repo.get_by_id(db, sick_leave.employee_id)
        employee_name = employee.name if employee else "Неизвестный сотрудник"

        days_count = (sick_leave.end_date - sick_leave.start_date).days + 1

        return {
            "id": sick_leave.id,
            "employee_id": sick_leave.employee_id,
            "employee_name": employee_name,
            "start_date": sick_leave.start_date,
            "end_date": sick_leave.end_date,
            "days_count": days_count,
            "status": sick_leave.status,
            "created_by": sick_leave.created_by,
            "created_at": sick_leave.created_at,
            "updated_by": sick_leave.updated_by,
            "comment": sick_leave.comment,
        }


sick_leave_service = SickLeaveService()
