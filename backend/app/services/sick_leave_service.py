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
from app.repositories.user_repository import UserRepository

audit_logger = get_audit_logger()


class SickLeaveService:
    """Сервис для управления больничными листами."""

    def __init__(self):
        self.repo = SickLeaveRepository()
        self.employee_repo = EmployeeRepository()
        self.user_repo = UserRepository()

    async def _resolve_actor(
        self, db: AsyncSession, username: str
    ) -> tuple[Optional[int], str]:
        """Мягкий резолв актора операции (#110).

        Возвращает (user_id | None, identity): user_id заполняется только если
        пользователь реально существует в ``users`` (обычный вход). Для identity
        вне ``users`` (break-glass ``emergency_admin``, сервисный аккаунт) —
        user_id = None, а provenance ведётся по username-строке.
        """
        user = await self.user_repo.get_by_username(db, username)
        if user is None:
            return None, username
        return int(user.id), username

    async def create_sick_leave(
        self, db: AsyncSession, data: dict, username: str
    ) -> Dict[str, Any]:
        """
        Создать запись о больничном.

        Args:
            db: Сессия базы данных
            data: Данные для создания (employee_id, start_date, end_date, comment, ...)
            username: Identity автора (username обычного пользователя или
                break-glass актора вне users, например emergency_admin)

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
        user_id, identity = await self._resolve_actor(db, username)

        sick_leave = SickLeave(
            employee_id=employee_id,
            start_date=start_date,
            end_date=end_date,
            comment=data.get("comment"),
            status=SickLeaveStatus.ACTIVE,
            created_at=date.today(),
            created_by=user_id,
            created_by_identity=identity,
        )

        created_sick_leave = await self.repo.create(db, sick_leave)

        audit_logger.info(
            "SICK LEAVE CREATED",
            extra={
                "action": "sick_leave_create",
                "entity_type": "sick_leave",
                "entity_id": created_sick_leave.id,
                "performed_by": identity,
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
        self, db: AsyncSession, sick_leave_id: int, data: dict, username: str
    ) -> Dict[str, Any]:
        """
        Обновить запись о больничном.

        Args:
            db: Сессия базы данных
            sick_leave_id: ID больничного
            data: Данные для обновления
            username: Identity автора (username или break-glass актор)

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

        user_id, identity = await self._resolve_actor(db, username)

        update_data = {}
        for field in ["start_date", "end_date", "comment"]:
            if field in data and data[field] is not None:
                update_data[field] = data[field]

        # Актёр фиксируется на инстансе напрямую (не через update_data):
        # для identity вне users user_id=None, и репозиторий не должен
        # скипать обнуление stale updated_by по общему правилу "value is not None".
        sick_leave.updated_by = user_id
        sick_leave.updated_by_identity = identity

        updated_sick_leave = await self.repo.update(db, sick_leave, update_data)

        audit_logger.info(
            "SICK LEAVE UPDATED",
            extra={
                "action": "sick_leave_update",
                "entity_type": "sick_leave",
                "entity_id": sick_leave_id,
                "performed_by": identity,
                "changes": update_data,
            },
        )

        return await self._build_response(db, updated_sick_leave)

    async def delete_sick_leave(
        self, db: AsyncSession, sick_leave_id: int, username: str
    ) -> bool:
        """
        Мягко удалить больничный (установить статус DELETED).

        Args:
            db: Сессия базы данных
            sick_leave_id: ID больничного
            username: Identity автора (username или break-glass актор)

        Returns:
            bool: True если успешно
        """
        sick_leave = await self.repo.get_by_id(db, sick_leave_id)
        if not sick_leave:
            raise SickLeaveNotFoundError(sick_leave_id)

        user_id, identity = await self._resolve_actor(db, username)

        await self.repo.soft_delete(db, sick_leave, user_id, identity)

        audit_logger.info(
            "SICK LEAVE DELETED",
            extra={
                "action": "sick_leave_delete",
                "entity_type": "sick_leave",
                "entity_id": sick_leave_id,
                "performed_by": identity,
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
            "created_by_identity": sick_leave.created_by_identity,
            "created_at": sick_leave.created_at,
            "updated_by": sick_leave.updated_by,
            "updated_by_identity": sick_leave.updated_by_identity,
            "deleted_by_identity": sick_leave.deleted_by_identity,
            "comment": sick_leave.comment,
        }


sick_leave_service = SickLeaveService()
