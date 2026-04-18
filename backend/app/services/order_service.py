import asyncio
import os
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from docx import Document
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import DuplicateError, EmployeeNotFoundError, HRMSException, OrderNotFoundError
from app.core.logging import get_audit_logger
from app.models.employee import Employee
from app.models.order import Order
from app.models.order_type import OrderType
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.order_type_repository import OrderTypeRepository
from app.schemas.order import OrderCreate
from app.schemas.order_type import OrderTypeCreate, OrderTypeUpdate

audit_logger = get_audit_logger()

DEFAULT_ORDER_TYPES: list[dict[str, Any]] = [
    {
        "code": "hire",
        "name": "Прием на работу",
        "show_in_orders_page": True,
        "template_filename": "prikaz_priem.docx",
        "field_schema": [
            {"key": "hire_date", "label": "Дата приема", "type": "date", "required": False},
            {"key": "contract_end", "label": "Конец контракта", "type": "date", "required": False},
            {"key": "trial_end", "label": "Конец испытательного срока", "type": "date", "required": False},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
    },
    {
        "code": "dismissal",
        "name": "Увольнение",
        "show_in_orders_page": True,
        "template_filename": "prikaz_uvolnenie.docx",
        "field_schema": [
            {"key": "dismissal_date", "label": "Дата увольнения", "type": "date", "required": False},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
    },
    {
        "code": "transfer",
        "name": "Перевод",
        "show_in_orders_page": True,
        "template_filename": "prikaz_perevod.docx",
        "field_schema": [
            {"key": "transfer_date", "label": "Дата перевода", "type": "date", "required": False},
            {"key": "transfer_reason", "label": "Основание", "type": "textarea", "required": False},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
    },
    {
        "code": "contract_extension",
        "name": "Продление контракта",
        "show_in_orders_page": True,
        "template_filename": "prikaz_prodlenie_kontrakta.docx",
        "field_schema": [
            {"key": "contract_new_end", "label": "Новая дата конца контракта", "type": "date", "required": False},
            {"key": "trial_end", "label": "Конец испытательного срока", "type": "date", "required": False},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
    },
    {
        "code": "vacation_paid",
        "name": "Отпуск трудовой",
        "show_in_orders_page": False,
        "template_filename": "prikaz_otpusk_trudovoy.docx",
        "field_schema": [
            {"key": "vacation_start", "label": "Дата начала", "type": "date", "required": True},
            {"key": "vacation_end", "label": "Дата окончания", "type": "date", "required": True},
            {"key": "vacation_days", "label": "Количество дней", "type": "number", "required": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
    },
    {
        "code": "vacation_unpaid",
        "name": "Отпуск за свой счет",
        "show_in_orders_page": False,
        "template_filename": "prikaz_otpusk_svoy_schet.docx",
        "field_schema": [
            {"key": "vacation_start", "label": "Дата начала", "type": "date", "required": True},
            {"key": "vacation_end", "label": "Дата окончания", "type": "date", "required": True},
            {"key": "vacation_days", "label": "Количество дней", "type": "number", "required": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
    },
]


class OrderService:
    def __init__(self):
        self.order_repo = OrderRepository()
        self.order_type_repo = OrderTypeRepository()
        self.employee_repo = EmployeeRepository()

    async def ensure_default_order_types(self, db: AsyncSession) -> list[OrderType]:
        existing = await self.order_type_repo.list_all(db)
        existing_by_code = {item.code: item for item in existing}
        changed = False

        for item in DEFAULT_ORDER_TYPES:
            current = existing_by_code.get(item["code"])
            if not current:
                created = await self.order_type_repo.create(db, item)
                existing_by_code[created.code] = created
                changed = True
                continue

            updates: dict[str, Any] = {}
            for key in ("name", "show_in_orders_page", "template_filename", "field_schema", "filename_pattern"):
                if getattr(current, key) != item.get(key):
                    updates[key] = item.get(key)
            if updates:
                await self.order_type_repo.update(db, current, updates)
                changed = True

        if changed:
            await db.commit()

        return list(existing_by_code.values())

    async def get_order_types(
        self,
        db: AsyncSession,
        active_only: bool = True,
        show_in_orders_page: bool | None = None,
    ) -> list[dict[str, Any]]:
        await self.ensure_default_order_types(db)
        items = await self.order_type_repo.list_all(
            db,
            active_only=active_only,
            show_in_orders_page=show_in_orders_page,
        )
        return [self._serialize_order_type(item) for item in items]

    async def get_order_type(self, db: AsyncSession, order_type_id: int) -> OrderType:
        await self.ensure_default_order_types(db)
        order_type = await self.order_type_repo.get_by_id(db, order_type_id)
        if not order_type:
            raise HRMSException("Тип приказа не найден", "order_type_not_found", status_code=404)
        return order_type

    async def get_order_type_by_code(self, db: AsyncSession, code: str) -> OrderType:
        await self.ensure_default_order_types(db)
        order_type = await self.order_type_repo.get_by_code(db, code)
        if not order_type:
            raise HRMSException("Тип приказа не найден", "order_type_not_found", status_code=404)
        return order_type

    async def create_order_type(self, db: AsyncSession, data: OrderTypeCreate) -> dict[str, Any]:
        await self.ensure_default_order_types(db)
        if await self.order_type_repo.get_by_code(db, data.code):
            raise DuplicateError(f"Тип приказа с кодом {data.code} уже существует", "duplicate_order_type_code")
        if await self.order_type_repo.get_by_name(db, data.name):
            raise DuplicateError(f"Тип приказа с названием {data.name} уже существует", "duplicate_order_type_name")

        created = await self.order_type_repo.create(db, data.model_dump())
        await db.commit()
        return self._serialize_order_type(created)

    async def update_order_type(self, db: AsyncSession, order_type_id: int, data: OrderTypeUpdate) -> dict[str, Any]:
        order_type = await self.get_order_type(db, order_type_id)
        payload = data.model_dump(exclude_unset=True)

        new_name = payload.get("name")
        if new_name and new_name != order_type.name:
            existing = await self.order_type_repo.get_by_name(db, new_name)
            if existing and existing.id != order_type.id:
                raise DuplicateError(f"Тип приказа с названием {new_name} уже существует", "duplicate_order_type_name")

        updated = await self.order_type_repo.update(db, order_type, payload)
        await db.commit()
        return self._serialize_order_type(updated)

    async def delete_order_type(self, db: AsyncSession, order_type_id: int) -> None:
        order_type = await self.get_order_type(db, order_type_id)
        order_count = await self.order_type_repo.count_orders(db, order_type_id)
        if order_count > 0:
            raise HRMSException(
                "Нельзя удалить тип приказа, который уже используется",
                "order_type_in_use",
                status_code=409,
            )

        template_path = self._get_template_path(order_type)
        if template_path.exists():
            template_path.unlink()

        await self.order_type_repo.delete(db, order_type)
        await db.commit()

    async def get_next_number(self, db: AsyncSession, year: Optional[int] = None) -> str:
        y = year or date.today().year
        return await self.order_repo.get_next_order_number(db, y)

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
    ) -> dict[str, Any]:
        items, total = await self.order_repo.get_all(
            db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            year=year,
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

    async def create_order(self, db: AsyncSession, data: OrderCreate) -> Order:
        await self.ensure_default_order_types(db)
        if db.in_transaction():
            return await self._do_create_order(db, data)
        async with db.begin():
            return await self._do_create_order(db, data)

    async def _do_create_order(self, db: AsyncSession, data: OrderCreate) -> Order:
        if data.order_number:
            order_number = data.order_number.strip()
        else:
            order_number = await self.order_repo.get_next_order_number(db, data.order_date.year)

        employee = await self.employee_repo.get_by_id(db, data.employee_id)
        if not employee:
            raise EmployeeNotFoundError(data.employee_id)

        if not data.order_type_id:
            raise HRMSException("Не передан order_type_id", "order_type_not_found", status_code=422)

        order_type = await self.order_type_repo.get_by_id(db, data.order_type_id)
        if not order_type or not order_type.is_active:
            raise HRMSException("Активный тип приказа не найден", "order_type_not_found", status_code=404)

        year_dir = Path(settings.ORDERS_PATH) / str(data.order_date.year)
        year_dir.mkdir(parents=True, exist_ok=True)

        file_path = await self._generate_document(order_number, data, employee, order_type, year_dir)

        order = await self.order_repo.create(
            db,
            {
                "order_number": order_number,
                "order_type_id": order_type.id,
                "employee_id": data.employee_id,
                "order_date": data.order_date,
                "file_path": file_path,
                "notes": data.notes,
                "extra_fields": data.extra_fields,
            },
        )

        audit_logger.info(
            f"ORDER CREATED: number={order_number}, type={order_type.name}, employee_id={data.employee_id}, employee_name={employee.name}",
            extra={
                "employee_id": data.employee_id,
                "employee_name": employee.name,
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

    async def _generate_document(
        self,
        order_number: str,
        data: OrderCreate,
        employee: Employee,
        order_type: OrderType,
        year_dir: Path,
    ) -> str:
        template_path = self._get_template_path(order_type)

        if template_path.exists():
            doc = await asyncio.wait_for(
                asyncio.to_thread(Document, str(template_path)),
                timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
            )
        else:
            doc = Document()
            doc.add_heading(f"Приказ №{order_number}", level=1)
            doc.add_paragraph(f"Тип: {order_type.name}")
            doc.add_paragraph(f"Дата: {data.order_date.strftime('%d.%m.%Y')}")
            doc.add_paragraph(f"Сотрудник: {employee.name}")

        replacements = self._prepare_replacements(order_number, data, employee, order_type)
        await asyncio.wait_for(
            asyncio.to_thread(self._replace_placeholders, doc, replacements),
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
        )

        filename = self._build_filename(order_number, order_type, replacements)
        file_path = year_dir / filename

        await asyncio.wait_for(
            asyncio.to_thread(doc.save, str(file_path)),
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
        )
        return str(file_path)

    def _prepare_replacements(
        self,
        order_number: str,
        data: OrderCreate,
        employee: Employee,
        order_type: OrderType,
    ) -> dict[str, str]:
        full_name = employee.name
        name_parts = full_name.split()
        last_name = name_parts[0] if name_parts else "Unknown"
        first_name = name_parts[1] if len(name_parts) > 1 else ""
        middle_name = name_parts[2] if len(name_parts) > 2 else ""
        initials = "_".join([p[0] for p in name_parts[1:]]) if len(name_parts) > 1 else ""
        initials_dots = " ".join([f"{p[0]}." for p in name_parts[1:]]) if len(name_parts) > 1 else ""
        initials_nospace = "".join([f"{p[0]}." for p in name_parts[1:]]) if len(name_parts) > 1 else ""

        position_name = str(employee.position.name if employee.position else "")
        position_cap = position_name.capitalize() if position_name else ""

        # Gender-aware acknowledgment
        oznak = "Ознакомлена" if employee.gender == "female" else "Ознакомлен"

        replacements = {
            "{order_number}": order_number,
            "{order_date}": data.order_date.strftime("%d.%m.%Y"),
            "{order_type_name}": order_type.name,
            "{order_type_code}": order_type.code,
            "{order_type_lower}": order_type.name.lower(),
            "{full_name}": full_name,
            "{full_name_upper}": full_name.upper(),
            "{full_name_title}": full_name.title(),
            "{full_name_last_caps}": f"{last_name.upper()} {first_name} {middle_name}".strip(),
            "{last_name_upper}": last_name.upper(),
            "{short_name}": f"{last_name} {initials_dots}".strip(),
            "{initials_before}": f"{initials_dots} {last_name}".strip(),
            "{last_name_then_initials}": f"{last_name} {initials_nospace}".strip(),
            "{last_name}": last_name,
            "{initials}": initials,
            "{tab_number}": str(employee.tab_number or ""),
            "{department}": str(employee.department.name if employee.department else ""),
            "{position}": position_name.lower(),
            "{position_cap}": position_cap,
            "{hire_date}": employee.hire_date.strftime("%d.%m.%Y") if employee.hire_date else "",
            "{contract_start}": employee.contract_start.strftime("%d.%m.%Y") if employee.contract_start else "",
            "{hire_order_date}": employee.hire_date.strftime("%d.%m.%Y") if employee.hire_date else "",
            "{oznak_gender}": oznak,
            "{notes}": data.notes or "",
        }

        for key, value in (data.extra_fields or {}).items():
            replacements[f"{{{key}}}"] = self._format_placeholder_value(value)

        return replacements

    def _replace_placeholders(self, doc: Document, replacements: dict[str, str]) -> None:
        for paragraph in doc.paragraphs:
            self._replace_in_runs(paragraph.runs, replacements)
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for paragraph in cell.paragraphs:
                        self._replace_in_runs(paragraph.runs, replacements)

    def _replace_in_runs(self, runs: list[Any], replacements: dict[str, str]) -> None:
        if not runs:
            return
        full_text = "".join(run.text for run in runs if run.text)
        for key, value in replacements.items():
            full_text = full_text.replace(key, value)
        runs[0].text = full_text
        for i in range(1, len(runs)):
            runs[i].text = ""

    async def sync_orders(self, db: AsyncSession, year: Optional[int] = None) -> dict[str, Any]:
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
            db_files = {Path(o.file_path).name for o in orders_in_db[0] if o.file_path}
            missing_files = db_files - files_on_disk
            for order in orders_in_db[0]:
                if order.file_path and Path(order.file_path).name in missing_files:
                    await self.order_repo.soft_delete(db, order.id, "sync")
                    deleted += 1

        await db.commit()
        return {"message": f"Синхронизация завершена: удалено {deleted}, добавление новых файлов отключено", "deleted": deleted, "added": 0}

    async def upload_template(self, db: AsyncSession, order_type_id: int, filename: str, content: bytes) -> dict[str, Any]:
        order_type = await self.get_order_type(db, order_type_id)
        safe_filename = self._normalize_template_filename(filename, order_type.code)
        template_path = Path(settings.TEMPLATES_PATH) / safe_filename
        template_path.parent.mkdir(parents=True, exist_ok=True)
        with open(template_path, "wb") as file_obj:
            file_obj.write(content)
        await self.order_type_repo.update(db, order_type, {"template_filename": safe_filename})
        await db.commit()
        return self._serialize_order_type(order_type)

    async def delete_template(self, db: AsyncSession, order_type_id: int) -> None:
        order_type = await self.get_order_type(db, order_type_id)
        template_path = self._get_template_path(order_type)
        if template_path.exists():
            template_path.unlink()
        await self.order_type_repo.update(db, order_type, {"template_filename": None})
        await db.commit()

    def get_template_variables(self) -> list[dict[str, str]]:
        """Возвращает список всех доступных переменных для шаблонов с описаниями"""
        return [
            {"name": "{order_number}", "description": "Номер приказа", "category": "Приказ"},
            {"name": "{order_date}", "description": "Дата приказа (ДД.ММ.ГГГГ)", "category": "Приказ"},
            {"name": "{order_type_name}", "description": "Название типа приказа", "category": "Приказ"},
            {"name": "{order_type_code}", "description": "Код типа приказа", "category": "Приказ"},
            {"name": "{order_type_lower}", "description": "Тип приказа строчными буквами", "category": "Приказ"},

            {"name": "{full_name}", "description": "ФИО полностью", "category": "ФИО"},
            {"name": "{full_name_upper}", "description": "ФИО заглавными буквами", "category": "ФИО"},
            {"name": "{full_name_title}", "description": "ФИО с заглавной буквы", "category": "ФИО"},
            {"name": "{full_name_last_caps}", "description": "Фамилия заглавными, имя отчество обычными", "category": "ФИО"},
            {"name": "{last_name_upper}", "description": "Фамилия заглавными буквами", "category": "ФИО"},
            {"name": "{short_name}", "description": "Фамилия И.О.", "category": "ФИО"},
            {"name": "{initials_before}", "description": "И.О. Фамилия", "category": "ФИО"},
            {"name": "{last_name_then_initials}", "description": "Фамилия И.О. (без пробела)", "category": "ФИО"},

            {"name": "{position}", "description": "Должность (все строчные)", "category": "Работа"},
            {"name": "{position_cap}", "description": "Должность (с заглавной буквы)", "category": "Работа"},
            {"name": "{department}", "description": "Подразделение", "category": "Работа"},
            {"name": "{tab_number}", "description": "Табельный номер", "category": "Работа"},

            {"name": "{hire_date}", "description": "Дата приема на работу (из карточки сотрудника)", "category": "Даты"},
            {"name": "{contract_start}", "description": "Дата начала контракта", "category": "Даты"},
            {"name": "{contract_end}", "description": "Дата окончания контракта (вводится вручную)", "category": "Даты"},
            {"name": "{trial_end}", "description": "Дата окончания испытательного срока (вводится вручную)", "category": "Даты"},
            {"name": "{hire_order_date}", "description": "Дата приема (для приказа «Прием на работу»)", "category": "Даты"},
            {"name": "{dismissal_date}", "description": "Дата увольнения (для приказа «Увольнение»)", "category": "Даты"},
            {"name": "{vacation_start}", "description": "Начало отпуска (для приказов «Отпуск»)", "category": "Даты"},
            {"name": "{vacation_end}", "description": "Конец отпуска (для приказов «Отпуск»)", "category": "Даты"},
            {"name": "{vacation_days}", "description": "Кол-во дней отпуска", "category": "Даты"},
            {"name": "{sick_leave_start}", "description": "Начало больничного", "category": "Даты"},
            {"name": "{sick_leave_end}", "description": "Конец больничного", "category": "Даты"},
            {"name": "{sick_leave_days}", "description": "Кол-во дней больничного", "category": "Даты"},
            {"name": "{transfer_date}", "description": "Дата перевода", "category": "Даты"},
            {"name": "{contract_new_end}", "description": "Новая дата конца контракта (для «Продление контракта»)", "category": "Даты"},

            {"name": "{oznak_gender}", "description": "Ознакомлен/ознакомлена (по полу сотрудника)", "category": "Прочее"},
            {"name": "{notes}", "description": "Комментарий к приказу", "category": "Прочее"},

            {"name": "{<key из field_schema>}", "description": "Любое дополнительное поле типа приказа", "category": "Поля типа"},
        ]

    async def cancel_order(self, db: AsyncSession, order_id: int, user_id: str) -> bool:
        order = await self.order_repo.get_by_id(db, order_id)
        if not order:
            raise OrderNotFoundError(order_id)
        await self.order_repo.cancel(db, order_id, user_id)
        await db.commit()
        return True

    async def hard_delete_order(self, db: AsyncSession, order_id: int) -> bool:
        order = await self.order_repo.get_by_id(db, order_id)
        if not order:
            raise OrderNotFoundError(order_id)

        employee = await self.employee_repo.get_by_id(db, order.employee_id)
        if order.file_path:
            try:
                os.remove(order.file_path)
            except OSError:
                pass

        await self.order_repo.hard_delete(db, order_id)
        await db.commit()

        audit_logger.info(
            f"ORDER DELETED: id={order_id}, number={order.order_number}, type={order.order_type.name if order.order_type else ''}, employee_id={order.employee_id}, employee_name={employee.name if employee else None}",
            extra={"employee_id": order.employee_id, "employee_name": employee.name if employee else None, "action": "order_deleted", "user_id": "system", "order_id": order_id},
        )
        return True

    def _serialize_order(self, order: Order) -> dict[str, Any]:
        employee_name = order.employee.name if getattr(order, "employee", None) else None
        order_type_name = order.order_type.name if getattr(order, "order_type", None) else ""
        order_type_code = order.order_type.code if getattr(order, "order_type", None) else ""
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
            "notes": order.notes,
            "extra_fields": order.extra_fields or {},
        }

    def _serialize_order_type(self, order_type: OrderType) -> dict[str, Any]:
        template_path = self._get_template_path(order_type)
        result = {
            "id": order_type.id,
            "code": order_type.code,
            "name": order_type.name,
            "is_active": order_type.is_active,
            "show_in_orders_page": order_type.show_in_orders_page,
            "template_filename": order_type.template_filename,
            "field_schema": order_type.field_schema or [],
            "filename_pattern": order_type.filename_pattern,
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

    def _get_template_path(self, order_type: OrderType) -> Path:
        if not order_type.template_filename:
            return Path(settings.TEMPLATES_PATH) / "__missing__.docx"
        return Path(settings.TEMPLATES_PATH) / order_type.template_filename

    def _normalize_template_filename(self, original_filename: str, code: str) -> str:
        ext = Path(original_filename).suffix or ".docx"
        return f"order_type_{code}{ext.lower()}"

    def _build_filename(self, order_number: str, order_type: OrderType, replacements: dict[str, str]) -> str:
        pattern = order_type.filename_pattern or "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx"
        filename = pattern
        for key, value in replacements.items():
            filename = filename.replace(key, value)
        if not filename.lower().endswith(".docx"):
            filename = f"{filename}.docx"
        sanitized = re.sub(r'[<>:"/\\\\|?*]+', "_", filename).strip()
        return sanitized or f"order_{order_number}.docx"

    def _format_placeholder_value(self, value: Any) -> str:
        if isinstance(value, str):
            try:
                parsed = datetime.strptime(value, "%Y-%m-%d")
                return parsed.strftime("%d.%m.%Y")
            except ValueError:
                return value
        return str(value)


order_service = OrderService()
