from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import insert as sa_insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import EmployeeNotFoundError, HRMSException, OrderNotFoundError, VacationOverlapError
from app.core.logging import get_audit_logger
from app.models.employee import Employee
from app.models.order import Order
from app.models.order_employee import OrderEmployee
from app.models.order_type import OrderType
from app.models.vacation import Vacation
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.order_type_repository import OrderTypeRepository
from app.repositories.vacation_repository import vacation_repository as _vacation_repo
from app.schemas.order import OrderCreate, OrderUpdate

from app.services.order_cleanup_service import OrderCleanupService
from app.services.order_document_service import (
    generate_document,
    generate_group_document,
    generate_weekend_call_group_document,
)
from app.services.order_draft_service import order_draft_service
from app.services.order_type_service import OrderTypeService

audit_logger = get_audit_logger()


class OrderService:
    def __init__(self):
        self.order_repo = OrderRepository()
        self.order_type_repo = OrderTypeRepository()
        self.employee_repo = EmployeeRepository()

        self.order_type_service = OrderTypeService()
        self.cleanup_service = OrderCleanupService()

    # === Order type delegation ===
    async def ensure_default_order_types(self, db: AsyncSession) -> list[OrderType]:
        return await self.order_type_service.ensure_default_order_types(db)

    async def get_order_types(
        self,
        db: AsyncSession,
        active_only: bool = True,
        show_in_orders_page: bool | None = None,
    ) -> list[dict[str, Any]]:
        return await self.order_type_service.get_order_types(db, active_only, show_in_orders_page)

    async def get_order_type(self, db: AsyncSession, order_type_id: int) -> OrderType:
        return await self.order_type_service.get_order_type(db, order_type_id)

    async def get_order_type_by_code(self, db: AsyncSession, code: str) -> OrderType:
        return await self.order_type_service.get_order_type_by_code(db, code)

    async def create_order_type(self, db: AsyncSession, data) -> dict[str, Any]:
        return await self.order_type_service.create_order_type(db, data)

    async def update_order_type(self, db: AsyncSession, order_type_id: int, data) -> dict[str, Any]:
        return await self.order_type_service.update_order_type(db, order_type_id, data)

    async def delete_order_type(self, db: AsyncSession, order_type_id: int) -> None:
        return await self.order_type_service.delete_order_type(db, order_type_id)

    async def upload_template(self, db: AsyncSession, order_type_id: int, filename: str, content: bytes) -> dict[str, Any]:
        return await self.order_type_service.upload_template(db, order_type_id, filename, content)

    async def delete_template(self, db: AsyncSession, order_type_id: int) -> None:
        return await self.order_type_service.delete_template(db, order_type_id)

    async def bulk_upload_templates(self, db: AsyncSession, files: list) -> dict[str, Any]:
        return await self.order_type_service.bulk_upload_templates(db, files)

    # === Repository delegation ===
    async def get_employee_by_id(self, db: AsyncSession, employee_id: int):
        """Get employee by ID (public wrapper to avoid direct repo access)."""
        return await self.employee_repo.get_by_id(db, employee_id)

    async def get_order_type_by_id(self, db: AsyncSession, order_type_id: int):
        """Get order type by ID (public wrapper to avoid direct repo access)."""
        return await self.order_type_repo.get_by_id(db, order_type_id)

    async def get_next_number(self, db: AsyncSession, order_type_id: int) -> str:
        return await self.order_repo.get_next_order_number(db, order_type_id)

    async def get_years(self, db: AsyncSession) -> list[int]:
        return await self.order_repo.get_years(db)

    async def get_all(
        self,
        db: AsyncSession,
        page: int = 1,
        per_page: int = 20,
        sort_by: Optional[str] = None,
        sort_order: str = "desc",
        year: Optional[int] = None,
        order_type_code: Optional[str] = None,
        order_letter: Optional[str] = None,
        employee_id: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        order_number: Optional[str] = None,
    ) -> dict[str, Any]:
        await self.ensure_default_order_types(db)
        items, total = await self.order_repo.get_all(
            db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            year=year,
            order_type_code=order_type_code,
            order_letter=order_letter,
            employee_id=employee_id,
            date_from=date_from,
            date_to=date_to,
            order_number=order_number,
        )
        total_pages = max(1, (total + per_page - 1) // per_page)
        return {
            "items": [self._serialize_order(order) for order in items],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    async def get_recent(self, db: AsyncSession, limit: int = 10, year: Optional[int] = None) -> list[dict[str, Any]]:
        items = await self.order_repo.get_recent(db, limit=limit, year=year)
        return [self._serialize_order(order) for order in items]

    async def get_by_id(self, db: AsyncSession, order_id: int) -> Order:
        order = await self.order_repo.get_by_id(db, order_id)
        if not order:
            raise OrderNotFoundError(order_id)
        return order

    # === Order creation ===
    async def create_order(self, db: AsyncSession, data: OrderCreate) -> Order:
        await self.ensure_default_order_types(db)
        if db.in_transaction():
            return await self._do_create_order(db, data)
        async with db.begin():
            return await self._do_create_order(db, data)

    async def _do_create_order(self, db: AsyncSession, data: OrderCreate) -> Order:
        order_number = data.order_number
        if not order_number:
            order_number = await self.order_repo.get_next_order_number(db, data.order_type_id)
        else:
            order_number = order_number.strip()

        employee = None
        if data.employee_id is not None:
            employee = await self.employee_repo.get_by_id(db, data.employee_id)
            if not employee:
                raise EmployeeNotFoundError(data.employee_id)

        if not data.order_type_id:
            raise HRMSException("Не передан order_type_id", "order_type_not_found", status_code=422)

        order_type = await self.order_type_repo.get_by_id(db, data.order_type_id)
        if not order_type or not order_type.is_active:
            raise HRMSException("Активный тип приказа не найден", "order_type_not_found", status_code=404)
        if data.employee_id is None and order_type.code != "general_order":
            raise HRMSException(
                "Для данного типа приказа требуется сотрудник",
                "employee_required",
                status_code=422,
            )

        year_dir = Path(settings.ORDERS_PATH) / str(data.order_date.year)
        year_dir.mkdir(parents=True, exist_ok=True)

        file_path, display_name = await generate_document(order_number, data, employee, order_type, year_dir)

        # Подготавливаем extra_fields для продления контракта
        extra_fields = data.extra_fields
        if order_type.code == "contract_extension" and data.extra_fields:
            new_end = data.extra_fields.get("contract_new_end")
            if new_end:
                extra_fields = dict(data.extra_fields)
                extra_fields["old_contract_end"] = (
                    employee.contract_end.isoformat() if employee.contract_end else None
                )
                employee.contract_end = date.fromisoformat(new_end)
                await db.flush()

        order = await self.order_repo.create(
            db,
            {
                "order_number": order_number,
                "order_type_id": order_type.id,
                "employee_id": data.employee_id,
                "order_date": data.order_date,
                "file_path": file_path,
                "display_name": display_name,
                "notes": data.notes,
                "extra_fields": extra_fields,
            },
        )

        # Автоматическая архивация сотрудника при приказе об увольнении
        if order_type.code == "dismissal" and employee and not employee.is_dismissed:
            dismissal_date = data.order_date
            if data.extra_fields and data.extra_fields.get("dismissal_date"):
                try:
                    from datetime import datetime as _dt
                    dismissal_date = _dt.strptime(data.extra_fields["dismissal_date"], "%Y-%m-%d").date()
                except (ValueError, TypeError):
                    pass
            employee.is_dismissed = True
            employee.dismissal_date = dismissal_date
            employee.dismissal_reason = f"Приказ №{order_number} от {data.order_date.strftime('%d.%m.%Y')}"
            employee.dismissed_by = "system"
            await db.flush()

        employee_name = employee.name if employee else None
        audit_logger.info(
            f"ORDER CREATED: number={order_number}, type={order_type.name}, employee_id={data.employee_id}, employee_name={employee_name}",
            extra={
                "employee_id": data.employee_id,
                "employee_name": employee_name,
                "action": "order_created",
                "user_id": "system",
                "order_id": order.id,
                "details": {
                    "order_number": order_number,
                    "order_type_name": order_type.name,
                    "order_type_code": order_type.code,
                    "order_date": str(data.order_date),
                },
            },
        )
        return order

    # === Order update ===
    async def update_order(self, db: AsyncSession, order_id: int, data: OrderUpdate, user_id: str) -> dict[str, Any]:
        order = await self.order_repo.get_by_id(db, order_id)
        if not order:
            raise OrderNotFoundError(f"Приказ {order_id} не найден")

        updates: dict[str, Any] = {}
        if data.order_number is not None:
            updates["order_number"] = data.order_number
        if data.order_date is not None:
            updates["order_date"] = data.order_date
        if data.notes is not None:
            updates["notes"] = data.notes
        if data.extra_fields is not None:
            updates["extra_fields"] = data.extra_fields

        if updates:
            for key, value in updates.items():
                setattr(order, key, value)
            await db.flush()
            await db.refresh(order)

        return self._serialize_order(order)

    # === Sync ===
    async def sync_orders(self, db: AsyncSession, year: Optional[int] = None) -> dict[str, Any]:
        from app.core.paths import storage_key

        years_to_check = [year] if year else await self.order_repo.get_years(db)
        if not years_to_check:
            return {"message": "Нет данных для синхронизации", "deleted": 0, "added": 0}

        deleted = 0
        for y in years_to_check:
            year_dir = Path(settings.ORDERS_PATH) / str(y)
            if not year_dir.exists():
                continue

            files_on_disk = {f.name for f in year_dir.iterdir() if f.is_file() and f.suffix == ".docx"}
            orders_in_db = await self.order_repo.get_all(db, page=1, per_page=10000, year=y)
            db_files = {Path(storage_key(o.file_path, "ORDERS_PATH")).name for o in orders_in_db[0] if o.file_path}
            missing_files = db_files - files_on_disk
            for order in orders_in_db[0]:
                if order.file_path and Path(storage_key(order.file_path, "ORDERS_PATH")).name in missing_files:
                    await self.order_repo.soft_delete(db, order.id, "sync")
                    deleted += 1

        await db.commit()
        return {"message": f"Синхронизация завершена: удалено {deleted}, добавление новых файлов отключено", "deleted": deleted, "added": 0}

    # === Cleanup delegation ===
    async def hard_delete_order(self, db: AsyncSession, order_id: int) -> bool:
        return await self.cleanup_service.hard_delete_order(db, order_id)

    # === Group orders ===
    async def create_vacation_unpaid_group_order(
        self, db: AsyncSession, data: "VacationUnpaidGroupOrderCreate"
    ) -> Order:
        """Create a group unpaid vacation order for multiple employees."""
        from datetime import timedelta

        await self.ensure_default_order_types(db)

        if not data.employees:
            raise HRMSException("Список сотрудников не может быть пустым", "validation_error", status_code=422)

        order_type = await self.get_order_type_by_code(db, "vacation_unpaid_group")

        order_number = data.order_number
        if not order_number:
            order_number = await self.order_repo.get_next_order_number(db, order_type.id)
        else:
            order_number = order_number.strip()

        common_start = data.vacation_start

        employee_rows = []
        for emp_item in data.employees:
            employee = await self.employee_repo.get_by_id(db, emp_item.employee_id)
            if not employee:
                raise EmployeeNotFoundError(emp_item.employee_id)

            vacation_end = common_start + timedelta(days=emp_item.vacation_days - 1)

            overlap = await _vacation_repo.check_overlap(db, emp_item.employee_id, common_start, vacation_end)
            if overlap:
                raise VacationOverlapError(
                    f"Пересечение отпуска для сотрудника {employee.name}: {overlap.start_date} — {overlap.end_date}"
                )

            employee_rows.append({
                "employee": employee,
                "vacation_days": emp_item.vacation_days,
                "vacation_end": vacation_end,
            })

        year_dir = Path(settings.ORDERS_PATH) / str(data.order_date.year)
        year_dir.mkdir(parents=True, exist_ok=True)

        file_path, display_name = await generate_group_document(
            order_number, data, order_type, year_dir, employee_rows,
        )

        order = await self.order_repo.create(
            db,
            {
                "order_number": order_number,
                "order_type_id": order_type.id,
                "employee_id": None,
                "order_date": data.order_date,
                "file_path": file_path,
                "display_name": display_name,
                "notes": None,
                "extra_fields": {},
                "is_group": True,
            },
        )

        for row in employee_rows:
            emp = row["employee"]
            await db.execute(
                sa_insert(OrderEmployee).values(
                    order_id=order.id,
                    employee_id=emp.id,
                    vacation_start=common_start,
                    vacation_end=row["vacation_end"],
                    vacation_days=row["vacation_days"],
                )
            )
            await db.execute(
                sa_insert(Vacation).values(
                    employee_id=emp.id,
                    start_date=common_start,
                    end_date=row["vacation_end"],
                    vacation_type="Отпуск за свой счет",
                    days_count=row["vacation_days"],
                    vacation_year=common_start.year,
                    order_id=order.id,
                )
            )

        await db.flush()

        # Reload order with relationships for serialization
        reload_result = await db.execute(
            select(Order)
            .options(
                selectinload(Order.order_type),
                selectinload(Order.employees)
                    .selectinload(OrderEmployee.employee)
                    .selectinload(Employee.position),
                selectinload(Order.employees)
                    .selectinload(OrderEmployee.employee)
                    .selectinload(Employee.department),
            )
            .where(Order.id == order.id)
            .execution_options(populate_existing=True)
        )
        order = reload_result.scalar_one()

        audit_logger.info(
            f"GROUP ORDER CREATED: number={order_number}, type=vacation_unpaid_group, employee_count={len(employee_rows)}",
            extra={
                "action": "group_order_created",
                "user_id": "system",
                "order_id": order.id,
                "details": {
                    "order_number": order_number,
                    "order_type_code": "vacation_unpaid",
                    "order_date": str(data.order_date),
                    "employee_count": len(employee_rows),
                },
            },
        )

        return order

    async def create_group_order_from_draft(
        self, db: AsyncSession, draft_id: str
    ) -> Order:
        """
        Commit a group order draft into a final Order.

        Reads metadata from .drafts/{draft_id}.json, validates it,
        dispatches to the correct creation logic based on order_type_code.
        """
        from datetime import timedelta
        from app.services.order_document_service import copy_docx_to_permanent
        from app.core.paths import storage_key

        # Read and validate metadata
        metadata = order_draft_service.read_draft_metadata(draft_id)
        if metadata.get("kind") != "group_order":
            raise HRMSException("Неверный тип черновика", "invalid_draft_kind", status_code=400)

        order_type_code = metadata.get("order_type_code")
        if not order_type_code:
            raise HRMSException("Тип приказа не указан в черновике", "missing_order_type_code", status_code=400)

        if metadata.get("schema_version", 0) != 1:
            raise HRMSException("Неподдерживаемая версия схемы черновика", "unsupported_draft_schema", status_code=400)

        payload = metadata["payload"]
        order_type = await self.get_order_type_by_code(db, order_type_code)

        order_number = payload.get("order_number")
        if not order_number:
            order_number = await self.order_repo.get_next_order_number(db, order_type.id)
        else:
            order_number = order_number.strip()

        def to_date(val):
            if isinstance(val, date):
                return val
            return date.fromisoformat(val) if val else None

        order_date = to_date(payload["order_date"])

        # Load employees
        employee_rows = []
        for emp_item in payload["employees"]:
            employee = await self.employee_repo.get_by_id(db, emp_item["employee_id"])
            if not employee:
                raise EmployeeNotFoundError(emp_item["employee_id"])

            vacation_days = emp_item["vacation_days"]
            employee_rows.append({
                "employee": employee,
                "vacation_days": vacation_days,
            })

        # Resolve draft DOCX path
        draft_path = order_draft_service.get_draft_path(draft_id)

        # Build permanent destination path
        year_dir = Path(settings.ORDERS_PATH) / str(order_date.year)
        year_dir.mkdir(parents=True, exist_ok=True)

        # Dispatch by order_type_code
        if order_type_code == "vacation_unpaid_group":
            common_start = to_date(payload["vacation_start"])

            # Check overlaps and prepare rows
            for row in employee_rows:
                emp = row["employee"]
                vacation_end = common_start + timedelta(days=row["vacation_days"] - 1)
                row["vacation_end"] = vacation_end

                overlap = await _vacation_repo.check_overlap(db, emp.id, common_start, vacation_end)
                if overlap:
                    raise VacationOverlapError(
                        f"Пересечение отпуска для сотрудника {emp.name}: {overlap.start_date} — {overlap.end_date}"
                    )

            storage_name = f"prikaz_{order_number}_vacation_unpaid_group_{common_start.strftime('%Y-%m-%d')}.docx"
            dest_path = year_dir / storage_name
            display_name = f"Приказ №{order_number} от {order_date.strftime('%d.%m.%Y')} — отпуск за свой счет (групповой, {len(employee_rows)} сотр.)"

        elif order_type_code == "weekend_call_group":
            mode = payload.get("mode", "single")
            if mode == "single":
                call_start = to_date(payload["call_date"])
                call_end = call_start
            else:
                call_start = to_date(payload["call_date_start"])
                call_end = to_date(payload["call_date_end"])
            call_days = (call_end - call_start).days + 1

            for row in employee_rows:
                row["vacation_days"] = call_days

            storage_name = f"prikaz_{order_number}_weekend_call_group_{call_start.strftime('%Y-%m-%d')}.docx"
            dest_path = year_dir / storage_name
            display_name = f"Приказ №{order_number} от {order_date.strftime('%d.%m.%Y')} — вызов в выходной (групповой, {len(employee_rows)} сотр.)"

        else:
            raise HRMSException(f"Неподдерживаемый тип группового приказа: {order_type_code}", "unsupported_group_type", status_code=400)

        # Copy edited draft DOCX to permanent path
        try:
            copy_docx_to_permanent(draft_path, dest_path)
        except Exception:
            raise HRMSException("Ошибка копирования документа", "docx_copy_error", status_code=500)

        # Create Order
        order = await self.order_repo.create(
            db,
            {
                "order_number": order_number,
                "order_type_id": order_type.id,
                "employee_id": None,
                "order_date": order_date,
                "file_path": storage_key(dest_path, "ORDERS_PATH"),
                "display_name": display_name,
                "notes": None,
                "extra_fields": {},
                "is_group": True,
            },
        )

        # Create OrderEmployee + type-specific records
        for row in employee_rows:
            emp = row["employee"]

            # Compute vacation_start/vacation_end for OrderEmployee based on type
            if order_type_code == "vacation_unpaid_group":
                emp_vacation_start = date.fromisoformat(payload["vacation_start"])
                emp_vacation_end = row["vacation_end"]
            elif order_type_code == "weekend_call_group":
                mode = payload.get("mode", "single")
                if mode == "single":
                    emp_vacation_start = to_date(payload["call_date"])
                    emp_vacation_end = emp_vacation_start
                else:
                    emp_vacation_start = to_date(payload["call_date_start"])
                    emp_vacation_end = to_date(payload["call_date_end"])

            await db.execute(
                sa_insert(OrderEmployee).values(
                    order_id=order.id,
                    employee_id=emp.id,
                    vacation_start=emp_vacation_start,
                    vacation_end=emp_vacation_end,
                    vacation_days=row["vacation_days"],
                )
            )

            # Type-specific records
            if order_type_code == "vacation_unpaid_group":
                await db.execute(
                    sa_insert(Vacation).values(
                        employee_id=emp.id,
                        start_date=to_date(payload["vacation_start"]),
                        end_date=row["vacation_end"],
                        vacation_type="Отпуск за свой счет",
                        days_count=row["vacation_days"],
                        vacation_year=order_date.year,
                        order_id=order.id,
                    )
                )
            elif order_type_code == "weekend_call_group":
                # Weekend call orders don't have separate tracking records
                pass

        await db.flush()

        # Reload order with relationships for serialization
        reload_result = await db.execute(
            select(Order)
            .options(
                selectinload(Order.order_type),
                selectinload(Order.employees)
                    .selectinload(OrderEmployee.employee)
                    .selectinload(Employee.position),
                selectinload(Order.employees)
                    .selectinload(OrderEmployee.employee)
                    .selectinload(Employee.department),
            )
            .where(Order.id == order.id)
            .execution_options(populate_existing=True)
        )
        order = reload_result.scalar_one()

        return order

    async def create_vacation_unpaid_group_order_from_draft(
        self, db: AsyncSession, draft_id: str
    ) -> Order:
        """Legacy wrapper for backward compatibility."""
        return await self.create_group_order_from_draft(db, draft_id)

    async def create_weekend_call_group_order(
        self, db: AsyncSession, data: "WeekendCallGroupOrderCreate"
    ) -> Order:
        """Create a group weekend call order for multiple employees."""
        from datetime import timedelta

        await self.ensure_default_order_types(db)

        if not data.employees:
            raise HRMSException("Список сотрудников не может быть пустым", "validation_error", status_code=422)

        order_type = await self.get_order_type_by_code(db, "weekend_call_group")

        order_number = data.order_number
        if not order_number:
            order_number = await self.order_repo.get_next_order_number(db, order_type.id)
        else:
            order_number = order_number.strip()

        # Determine call period from mode
        if data.mode == "single":
            if not data.call_date:
                raise HRMSException("Укажите дату вызова", "validation_error", status_code=422)
            call_start = data.call_date
            call_end = data.call_date
            call_days = 1
        else:
            if not data.call_date_start or not data.call_date_end:
                raise HRMSException("Укажите период вызова", "validation_error", status_code=422)
            call_start = data.call_date_start
            call_end = data.call_date_end
            call_days = (call_end - call_start).days + 1

        employee_rows = []
        for emp_item in data.employees:
            employee = await self.employee_repo.get_by_id(db, emp_item.employee_id)
            if not employee:
                raise EmployeeNotFoundError(emp_item.employee_id)

            employee_rows.append({
                "employee": employee,
                "vacation_days": call_days,
            })

        year_dir = Path(settings.ORDERS_PATH) / str(data.order_date.year)
        year_dir.mkdir(parents=True, exist_ok=True)

        file_path, display_name = await generate_weekend_call_group_document(
            order_number, data, order_type, year_dir, employee_rows, call_start, call_end,
        )

        order = await self.order_repo.create(
            db,
            {
                "order_number": order_number,
                "order_type_id": order_type.id,
                "employee_id": None,
                "order_date": data.order_date,
                "file_path": file_path,
                "display_name": display_name,
                "notes": None,
                "extra_fields": {},
                "is_group": True,
            },
        )

        for row in employee_rows:
            emp = row["employee"]
            await db.execute(
                sa_insert(OrderEmployee).values(
                    order_id=order.id,
                    employee_id=emp.id,
                    vacation_start=call_start,
                    vacation_end=call_end,
                    vacation_days=row["vacation_days"],
                )
            )

        await db.flush()

        # Reload order with relationships for serialization
        reload_result = await db.execute(
            select(Order)
            .options(
                selectinload(Order.order_type),
                selectinload(Order.employees)
                    .selectinload(OrderEmployee.employee)
                    .selectinload(Employee.position),
                selectinload(Order.employees)
                    .selectinload(OrderEmployee.employee)
                    .selectinload(Employee.department),
            )
            .where(Order.id == order.id)
            .execution_options(populate_existing=True)
        )
        order = reload_result.scalar_one()

        audit_logger.info(
            f"GROUP ORDER CREATED: number={order_number}, type=weekend_call_group, employee_count={len(employee_rows)}",
            extra={
                "action": "group_order_created",
                "user_id": "system",
                "order_id": order.id,
                "details": {
                    "order_number": order_number,
                    "order_type_code": "weekend_call_group",
                    "order_date": str(data.order_date),
                    "employee_count": len(employee_rows),
                },
            },
        )

        return order

    # === Serialization ===
    def _serialize_order(self, order: Order) -> dict[str, Any]:
        from sqlalchemy import inspect as sa_inspect
        from sqlalchemy.orm.attributes import LoaderCallableStatus

        state = sa_inspect(order)
        loaded = state.attrs

        def _get_loaded(name: str):
            attr = getattr(loaded, name, None)
            if attr is None:
                return None
            val = attr.loaded_value
            if val is LoaderCallableStatus:
                return None
            return val

        ot = _get_loaded("order_type")
        emp = _get_loaded("employee")
        emps = _get_loaded("employees")

        order_type_name = ot.name if ot else ""
        order_type_code = ot.code if ot else ""
        employee_name = emp.name if emp else None
        is_group = bool(getattr(order, "is_group", False))
        group_employee_count = len(emps) if is_group and emps else None

        group_employees = None
        if is_group and emps:
            group_employees = [
                {
                    "employee_id": e.employee_id,
                    "employee_full_name": e.employee.name if e.employee else None,
                    "position": e.employee.position.name if e.employee and e.employee.position else None,
                    "department": e.employee.department.name if e.employee and e.employee.department else None,
                    "vacation_start": e.vacation_start.isoformat() if e.vacation_start else None,
                    "vacation_end": e.vacation_end.isoformat() if e.vacation_end else None,
                    "vacation_days": e.vacation_days,
                }
                for e in emps
            ]
        
        return {
            "id": order.id,
            "order_number": order.order_number,
            "order_type_id": order.order_type_id,
            "order_type_name": order_type_name,
            "order_type_code": order_type_code,
            "employee_id": order.employee_id,
            "employee_name": employee_name,
            "order_date": order.order_date,
            "created_date": order.created_date,
            "file_path": order.file_path,
            "display_name": order.display_name,
            "notes": order.notes,
            "extra_fields": order.extra_fields or {},
            "is_group": is_group,
            "group_employee_count": group_employee_count,
            "group_employees": group_employees,
        }

    def _serialize_order_type(self, order_type: OrderType) -> dict[str, Any]:
        from app.services.order_document_service import get_template_path

        template_path = get_template_path(order_type)
        result = {
            "id": order_type.id,
            "code": order_type.code,
            "name": order_type.name,
            "is_active": order_type.is_active,
            "show_in_orders_page": order_type.show_in_orders_page,
            "template_filename": order_type.template_filename,
            "display_name": order_type.display_name,
            "field_schema": order_type.field_schema or [],
            "filename_pattern": order_type.filename_pattern,
            "letter": order_type.letter,
            "template_exists": template_path.exists(),
            "created_at": order_type.created_at,
            "updated_at": order_type.updated_at,
        }
        if template_path.exists():
            stat = template_path.stat()
            result["file_size"] = stat.st_size
            result["last_modified"] = datetime.fromtimestamp(stat.st_mtime).isoformat()
        else:
            result["file_size"] = None
            result["last_modified"] = None
        return result


order_service = OrderService()
