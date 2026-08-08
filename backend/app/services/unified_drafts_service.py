"""Объединённые черновики: список, данные формы и сокращённые имена.

Слой сервиса для фичи «Все черновики» (#58–#63): приказы (файловые
метаданные) + уведомления и заявления (БД, is_draft). Роутеры onlyoffice
обращаются сюда, а не к БД напрямую, и не строят заголовки/сокращения ФИО.

Здесь же живёт единственная точка пакетной загрузки сотрудников и типов
приказов для списков черновиков — без N+1 по `get_employee_by_id`.
"""
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import HRMSException
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.order_type_repository import OrderTypeRepository
from app.repositories.statement_repository import StatementRepository
from app.services.order_draft_service import normalize_draft_save_status, order_draft_service
from app.services.onlyoffice_form_data import (
    DraftFormData,
    draft_form_data as build_draft_form_data,
    notification_form_data as build_notification_form_data,
    statement_form_data as build_statement_form_data,
)


def _draft_sort_ts(value: str | None):
    """Парсить created_at (ISO со смещением или без) для устойчивой сортировки."""
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return datetime.min.replace(tzinfo=timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


class AllDraftsItem(BaseModel):
    draft_id: str
    kind: str
    title: str | None
    type_name: str | None
    number: str | None
    date: str | None
    created_at: str | None
    save_status: dict[str, Any] | None
    view_url: str
    edit_url: str
    list_url: str
    group_employees: list[dict[str, Any]] | None = None


class UnifiedDraftsService:
    def __init__(self) -> None:
        self.employee_repo = EmployeeRepository()
        self.order_type_repo = OrderTypeRepository()
        self.notification_repo = NotificationRepository()
        self.statement_repo = StatementRepository()

    # === Приказы (файловые черновики) ===
    async def list_order_drafts(self, db: AsyncSession) -> list[dict[str, Any]]:
        """Список черновиков приказов с именами сотрудников и типов (без N+1)."""
        drafts = order_draft_service.list_drafts()

        employees_map = await self._load_employees(db, self._collect_order_employee_ids(drafts))
        order_types_map = await self._load_order_types_by_code(
            db, self._collect_order_type_codes(drafts)
        )

        result = []
        for meta in drafts:
            payload = meta.get("payload", {})
            item = {
                "draft_id": meta.get("draft_id"),
                "kind": meta.get("kind"),
                "order_type_code": meta.get("order_type_code"),
                "order_number": payload.get("order_number"),
                "order_date": payload.get("order_date"),
                "employee_id": payload.get("employee_id"),
                "employee_name": None,
                "order_type_name": None,
                "created_by": meta.get("created_by"),
                "created_at": meta.get("created_at"),
                "status": meta.get("status", "draft"),
                "save_status": normalize_draft_save_status(meta.get("save_status")),
                "file_name": None,
                "file_path": None,
            }
            try:
                draft_path = order_draft_service.get_draft_path(meta["draft_id"])
                item["file_name"] = draft_path.name
                item["file_path"] = str(draft_path)
            except HRMSException:
                pass
            if payload.get("employee_id"):
                emp = employees_map.get(payload["employee_id"])
                if emp:
                    item["employee_name"] = emp.name
            if meta.get("order_type_code"):
                order_type = order_types_map.get(meta["order_type_code"])
                item["order_type_name"] = order_type.name if order_type else meta["order_type_code"]
            if meta.get("kind") == "group_order":
                item["group_employee_count"] = len(payload.get("employees", []))
            result.append(item)
        return result

    # === Все виды (приказы + уведомления + заявления) ===
    async def list_all_drafts(self, db: AsyncSession) -> list[AllDraftsItem]:
        """Объединённый список всех черновиков: приказы, уведомления, заявления."""
        items: list[AllDraftsItem] = []
        drafts = order_draft_service.list_drafts()

        employees_map = await self._load_employees(db, self._collect_order_employee_ids(drafts))
        order_types_map = await self._load_order_types_by_code(
            db, self._collect_order_type_codes(drafts)
        )

        # Приказы (файловые черновики)
        for meta in drafts:
            payload = meta.get("payload", {})
            draft_id = meta["draft_id"]
            kind = meta.get("kind")
            group_employees = None
            if kind == "group_order":
                group_emp_items = payload.get("employees", [])
                title = f"Групповой приказ — {len(group_emp_items)} сотрудников"
                resolved = []
                for emp_item in group_emp_items:
                    emp_id = emp_item.get("employee_id")
                    if not emp_id:
                        continue
                    emp = employees_map.get(emp_id)
                    if emp:
                        resolved.append({
                            "employee_id": emp_id,
                            "employee_full_name": emp.name,
                        })
                group_employees = resolved or None
            else:
                employee_name = None
                if payload.get("employee_id"):
                    emp = employees_map.get(payload["employee_id"])
                    if emp:
                        employee_name = emp.name
                title = employee_name or None

            order_type_code = meta.get("order_type_code")
            order_type = order_types_map.get(order_type_code) if order_type_code else None
            type_name = order_type.name if order_type else order_type_code

            items.append(AllDraftsItem(
                draft_id=draft_id,
                kind="order",
                title=title,
                type_name=type_name,
                number=payload.get("order_number"),
                date=payload.get("order_date"),
                created_at=meta.get("created_at"),
                save_status=normalize_draft_save_status(meta.get("save_status")),
                view_url=f"/drafts/{draft_id}/view-docx",
                edit_url=f"/drafts/{draft_id}/edit-docx",
                list_url="/drafts",
                group_employees=group_employees,
            ))

        # Уведомления (БД, is_draft)
        notifications = await self.notification_repo.list_drafts(db)
        for n in notifications:
            title = n.employee.name if n.employee else n.title
            items.append(AllDraftsItem(
                draft_id=f"notification:{n.id}",
                kind="notification",
                title=title,
                type_name=n.notification_type.name if n.notification_type else None,
                number=n.number,
                date=n.date.isoformat() if n.date else None,
                created_at=n.created_at.isoformat() if n.created_at else None,
                save_status=None,
                view_url=f"/notifications/{n.id}/view-docx",
                edit_url=f"/notifications/{n.id}/edit-docx",
                list_url="/orders/notifications",
            ))

        # Заявления (БД, is_draft)
        statements = await self.statement_repo.list_drafts(db)
        for s in statements:
            title = s.employee.name if s.employee else s.title
            items.append(AllDraftsItem(
                draft_id=f"statement:{s.id}",
                kind="statement",
                title=title,
                type_name=s.statement_type.name if s.statement_type else None,
                number=s.number,
                date=s.date.isoformat() if s.date else None,
                created_at=s.created_at.isoformat() if s.created_at else None,
                save_status=None,
                view_url=f"/statements/{s.id}/view-docx",
                edit_url=f"/statements/{s.id}/edit-docx",
                list_url="/orders/statements",
            ))

        # Сортировка: свежие сверху, без даты — в конец
        items.sort(key=lambda d: _draft_sort_ts(d.created_at), reverse=True)
        return items

    # === Данные для кнопки «Заполнить поля» ===
    async def get_draft_form_data(self, db: AsyncSession, draft_id: str) -> DraftFormData:
        """Данные черновика для кнопки «Заполнить поля» (пересоздание документа).

        Поля приходят массивом `data` ([{"key", "value"}, ...]); сборка — в
        app.services.onlyoffice_form_data (единый источник для конфига OnlyOffice).
        """
        # Уведомления / заявления — черновики из БД
        if draft_id.startswith("notification:"):
            n_id = int(draft_id.split(":", 1)[1])
            n = await self.notification_repo.get_draft_by_id(db, n_id)
            if not n:
                raise HRMSException("Черновик не найден", "draft_not_found", status_code=404)
            return DraftFormData(kind="notification", data=build_notification_form_data(n))

        if draft_id.startswith("statement:"):
            s_id = int(draft_id.split(":", 1)[1])
            s = await self.statement_repo.get_draft_by_id(db, s_id)
            if not s:
                raise HRMSException("Черновик не найден", "draft_not_found", status_code=404)
            return DraftFormData(kind="statement", data=build_statement_form_data(s))

        # Приказы — файловые черновики
        meta = order_draft_service.read_draft_metadata(draft_id)
        order_type_code = meta.get("order_type_code")

        if meta.get("kind") == "group_order":
            return DraftFormData(
                kind="order",
                is_group=True,
                order_type_code=order_type_code,
                data=build_draft_form_data(meta),
                employees=meta.get("payload", {}).get("employees") or [],
            )

        if meta.get("kind") != "single_order":
            raise HRMSException(
                "Заполнение полей для этого типа черновика не поддерживается",
                "draft_form_not_supported",
                status_code=400,
            )

        return DraftFormData(
            kind="order",
            order_type_code=order_type_code,
            data=build_draft_form_data(meta),
        )

    # === Пакетная загрузка справочников ===
    @staticmethod
    def _collect_order_employee_ids(drafts: list[dict[str, Any]]) -> list[int]:
        employee_ids: set[int] = set()
        for meta in drafts:
            payload = meta.get("payload", {})
            if meta.get("kind") == "group_order":
                for emp_item in payload.get("employees", []):
                    emp_id = emp_item.get("employee_id")
                    if emp_id:
                        employee_ids.add(emp_id)
            elif payload.get("employee_id"):
                employee_ids.add(payload["employee_id"])
        return list(employee_ids)

    @staticmethod
    def _collect_order_type_codes(drafts: list[dict[str, Any]]) -> list[str]:
        codes: set[str] = set()
        for meta in drafts:
            code = meta.get("order_type_code")
            if code:
                codes.add(str(code))
        return list(codes)

    async def _load_employees(self, db: AsyncSession, employee_ids: list[int]) -> dict[int, Any]:
        return await self.employee_repo.get_by_ids(db, employee_ids)

    async def _load_order_types_by_code(self, db: AsyncSession, codes: list[str]) -> dict[str, Any]:
        return await self.order_type_repo.list_by_codes(db, codes)


unified_drafts_service = UnifiedDraftsService()
