import asyncio
import os
import re
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from docx import Document
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import EmployeeNotFoundError, OrderNotFoundError
from app.models.employee import Employee
from app.models.order import Order
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.order_repository import OrderRepository
from app.schemas.order import OrderCreate
from app.utils.file_helpers import (
    ORDER_TYPES,
    TEMPLATE_MAP,
    extract_name_parts,
    get_order_type_short,
    get_template_filename,
)


class OrderService:
    def __init__(self):
        self.order_repo = OrderRepository()
        self.employee_repo = EmployeeRepository()

    def get_order_types(self) -> list[str]:
        return ORDER_TYPES

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
    ) -> dict:
        items, total = await self.order_repo.get_all(
            db, page=page, per_page=per_page, sort_by=sort_by, sort_order=sort_order, year=year
        )
        total_pages = max(1, (total + per_page - 1) // per_page)
        result_items = []
        for order in items:
            employee = await self.employee_repo.get_by_id(db, order.employee_id)
            result_items.append({
                "id": order.id,
                "order_number": order.order_number,
                "order_type": order.order_type,
                "employee_id": order.employee_id,
                "employee_name": employee.name if employee else None,
                "order_date": order.order_date,
                "created_date": order.created_date,
                "file_path": order.file_path,
                "notes": order.notes,
            })
        return {
            "items": result_items,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    async def get_recent(
        self, db: AsyncSession, limit: int = 10, year: Optional[int] = None
    ) -> list[dict]:
        items = await self.order_repo.get_recent(db, limit=limit, year=year)
        result = []
        for order in items:
            employee = await self.employee_repo.get_by_id(db, order.employee_id)
            result.append({
                "id": order.id,
                "order_number": order.order_number,
                "order_type": order.order_type,
                "employee_id": order.employee_id,
                "employee_name": employee.name if employee else None,
                "order_date": order.order_date,
                "created_date": order.created_date,
                "file_path": order.file_path,
                "notes": order.notes,
            })
        return result

    async def get_by_id(self, db: AsyncSession, order_id: int) -> Order:
        order = await self.order_repo.get_by_id(db, order_id)
        if not order:
            raise OrderNotFoundError(order_id)
        return order

    async def create_order(self, db: AsyncSession, data: OrderCreate) -> Order:
        async with db.begin():
            if data.order_number:
                order_number = f"{int(data.order_number):02d}"
            else:
                year = data.order_date.year
                order_number = await self.order_repo.get_next_order_number(db, year)

            employee = await self.employee_repo.get_by_id(db, data.employee_id)
            if not employee:
                raise EmployeeNotFoundError(data.employee_id)

            year_dir = Path(settings.ORDERS_PATH) / str(data.order_date.year)
            year_dir.mkdir(parents=True, exist_ok=True)

            file_path = await self._generate_document(order_number, data, employee, year_dir)

            order = await self.order_repo.create(db, {
                "order_number": order_number,
                "order_type": data.order_type,
                "employee_id": data.employee_id,
                "order_date": data.order_date,
                "file_path": file_path,
                "notes": data.notes,
            })

            return order

    async def _generate_document(
        self,
        order_number: str,
        data: OrderCreate,
        employee: Employee,
        year_dir: Path,
    ) -> str:
        template_filename = get_template_filename(data.order_type)
        template_path = Path(settings.TEMPLATES_PATH) / template_filename if template_filename else None

        if template_path and template_path.exists():
            doc = await asyncio.wait_for(
                asyncio.to_thread(Document, str(template_path)),
                timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
            )
        else:
            doc = Document()
            doc.add_heading(f"Приказ №{order_number}", level=1)
            doc.add_paragraph(f"Тип: {data.order_type}")
            doc.add_paragraph(f"Дата: {data.order_date.strftime('%d.%m.%Y')}")
            doc.add_paragraph(f"Сотрудник: {employee.name}")
            doc.add_paragraph(f"Табельный номер: {employee.tab_number}")
            doc.add_paragraph(f"Подразделение: {employee.department}")
            doc.add_paragraph(f"Должность: {employee.position}")

        replacements = self._prepare_replacements(order_number, data, employee)
        await asyncio.wait_for(
            asyncio.to_thread(self._replace_placeholders, doc, replacements),
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
        )

        last_name, initials = extract_name_parts(employee.name)
        order_type_short = get_order_type_short(data.order_type)
        day = data.order_date.strftime("%d")
        month = data.order_date.strftime("%m")
        filename = f"Приказ_№{order_number}_к_{day}_{month}_{order_type_short}_{last_name}_{initials}.docx"
        file_path = year_dir / filename

        await asyncio.wait_for(
            asyncio.to_thread(doc.save, str(file_path)),
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
        )

        return str(file_path)

    def _prepare_replacements(
        self, order_number: str, data: OrderCreate, employee: Employee
    ) -> dict[str, str]:
        full_name = employee.name
        name_parts = full_name.split()
        last_name = name_parts[0] if name_parts else "Unknown"
        initials_dots = " ".join([f"{p[0]}." for p in name_parts[1:]]) if len(name_parts) > 1 else ""
        initials_underscore = "_".join([p[0] for p in name_parts[1:]]) if len(name_parts) > 1 else ""
        initials_nospace = "".join([f"{p[0]}." for p in name_parts[1:]]) if len(name_parts) > 1 else ""

        full_name_upper = full_name.upper()
        full_name_title = full_name.title()
        last_name_upper = last_name.upper()
        rest_parts = name_parts[1:]
        rest_title = " ".join([p.capitalize() for p in rest_parts]) if rest_parts else ""
        full_name_last_caps = f"{last_name_upper} {rest_title}".strip()

        short_name = f"{last_name} {initials_dots}".strip()
        initials_before = f"{initials_dots} {last_name}".strip()
        last_name_then_initials = f"{last_name} {initials_nospace}".strip()

        order_date = data.order_date
        order_type_lower = data.order_type.lower()

        hire_date_str = employee.hire_date.strftime("%d.%m.%Y") if employee.hire_date else ""
        contract_start_str = employee.contract_start.strftime("%d.%m.%Y") if employee.contract_start else ""

        if employee.gender == "М":
            oznak = "ознакомлен"
        elif employee.gender == "Ж":
            oznak = "ознакомлена"
        else:
            oznak = "ознакомлен(а)"

        extra = data.extra_fields or {}

        def fmt_extra(key: str) -> str:
            val = extra.get(key, "")
            if val and key.endswith("_date") or key in ("hire_order_date", "dismissal_date", "vacation_start", "vacation_end", "sick_leave_start", "sick_leave_end", "transfer_date", "contract_new_end", "contract_end", "trial_end"):
                try:
                    return datetime.strptime(str(val), "%Y-%m-%d").strftime("%d.%m.%Y")
                except ValueError:
                    return str(val)
            return str(val) if val != "" else ""

        return {
            "{order_number}": order_number,
            "{order_date}": order_date.strftime("%d.%m.%Y"),
            "{order_type_lower}": order_type_lower,
            "{full_name}": full_name,
            "{full_name_upper}": full_name_upper,
            "{full_name_title}": full_name_title,
            "{full_name_last_caps}": full_name_last_caps,
            "{last_name_upper}": last_name_upper,
            "{short_name}": short_name,
            "{initials_before}": initials_before,
            "{last_name_then_initials}": last_name_then_initials,
            "{position}": (employee.position or "").lower() if employee.position else "",
            "{position_cap}": (employee.position or "").capitalize() if employee.position else "",
            "{department}": employee.department or "",
            "{tab_number}": str(employee.tab_number),
            "{contract_end}": fmt_extra("contract_end"),
            "{trial_end}": fmt_extra("trial_end"),
            "{contract_number}": "332/1",
            "{hire_date}": hire_date_str,
            "{contract_start}": contract_start_str,
            "{hire_order_date}": fmt_extra("hire_date"),
            "{dismissal_date}": fmt_extra("dismissal_date"),
            "{vacation_start}": fmt_extra("vacation_start"),
            "{vacation_end}": fmt_extra("vacation_end"),
            "{vacation_days}": str(extra.get("vacation_days", "")),
            "{sick_leave_start}": fmt_extra("sick_leave_start"),
            "{sick_leave_end}": fmt_extra("sick_leave_end"),
            "{sick_leave_days}": str(extra.get("sick_leave_days", "")),
            "{transfer_date}": fmt_extra("transfer_date"),
            "{contract_new_end}": fmt_extra("contract_new_end"),
            "{oznak_gender}": oznak,
        }

    def _replace_placeholders(self, doc: Document, replacements: dict[str, str]):
        for paragraph in doc.paragraphs:
            self._replace_in_runs(paragraph.runs, replacements)

        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for paragraph in cell.paragraphs:
                        self._replace_in_runs(paragraph.runs, replacements)

        for section in doc.sections:
            for hdr in [section.header, section.first_page_header, section.even_page_header]:
                for paragraph in hdr.paragraphs:
                    self._replace_in_runs(paragraph.runs, replacements)
                for table in hdr.tables:
                    for row in table.rows:
                        for cell in row.cells:
                            for paragraph in cell.paragraphs:
                                self._replace_in_runs(paragraph.runs, replacements)
            
            for ftr in [section.footer, section.first_page_footer, section.even_page_footer]:
                for paragraph in ftr.paragraphs:
                    self._replace_in_runs(paragraph.runs, replacements)
                for table in ftr.tables:
                    for row in table.rows:
                        for cell in row.cells:
                            for paragraph in cell.paragraphs:
                                self._replace_in_runs(paragraph.runs, replacements)

    def _replace_in_runs(self, runs: list, replacements: dict[str, str]):
        if not runs:
            return

        full_text = "".join(run.text for run in runs if run.text)

        for key, value in replacements.items():
            full_text = full_text.replace(key, value)

        runs[0].text = full_text
        for i in range(1, len(runs)):
            runs[i].text = ""

    async def sync_orders(self, db: AsyncSession, year: Optional[int] = None) -> dict:
        years_to_check = [year] if year else await self.order_repo.get_years(db)
        if not years_to_check:
            return {"message": "Нет данных для синхронизации", "deleted": 0, "added": 0}

        deleted = 0
        added = 0

        for y in years_to_check:
            year_dir = Path(settings.ORDERS_PATH) / str(y)
            if not year_dir.exists():
                continue

            files_on_disk = set()
            for f in year_dir.iterdir():
                if f.is_file() and f.suffix == ".docx":
                    files_on_disk.add(f.name)

            orders_in_db = await self.order_repo.get_all(db, page=1, per_page=10000, year=y)
            db_files = {Path(o.file_path).name for o in orders_in_db[0] if o.file_path}

            orphan_files = files_on_disk - db_files
            for filename in orphan_files:
                match = re.match(
                    r"Приказ_№(\d+)_к_(\d+)_(\d+)_(.+?)_(.+?)_(.+?)\.docx",
                    filename,
                )
                if match:
                    order_number = match.group(1)
                    order_date_str = f"{match.group(3)}.{match.group(2)}.{y}"
                    order_type_raw = match.group(4)
                    last_name = match.group(5)
                    initials = match.group(6)

                    order_type = None
                    for ot, short in {
                        "Прием на работу": "прием",
                        "Увольнение": "увольнение",
                        "Отпуск трудовой": "отпуск",
                        "Отпуск за свой счет": "отпуск_бс",
                        "Больничный": "больничный",
                        "Перевод": "перевод",
                        "Продление контракта": "продление",
                    }.items():
                        if short == order_type_raw:
                            order_type = ot
                            break

                    if order_type:
                        try:
                            order_date = datetime.strptime(order_date_str, "%d.%m.%Y").date()
                        except ValueError:
                            continue

                        search_q = f"{last_name}"
                        employees = await self.employee_repo.search(db, search_q)
                        if employees:
                            emp = employees[0]
                            file_path = str(year_dir / filename)
                            await self.order_repo.create(db, {
                                "order_number": order_number,
                                "order_type": order_type,
                                "employee_id": emp.id,
                                "order_date": order_date,
                                "file_path": file_path,
                                "notes": "Добавлено при синхронизации",
                            })
                            added += 1

            missing_files = db_files - files_on_disk
            for order in orders_in_db[0]:
                if order.file_path and Path(order.file_path).name in missing_files:
                    await self.order_repo.soft_delete(db, order.id, "sync")
                    deleted += 1

        return {
            "message": f"Синхронизация завершена: добавлено {added}, удалено {deleted}",
            "deleted": deleted,
            "added": added,
        }

    def get_template_info(self, order_type: str) -> dict:
        filename = get_template_filename(order_type)
        if not filename:
            return {"name": "", "order_type": order_type, "exists": False}

        file_path = Path(settings.TEMPLATES_PATH) / filename
        info = {
            "name": filename,
            "order_type": order_type,
            "exists": file_path.exists(),
        }
        if file_path.exists():
            stat = file_path.stat()
            info["file_size"] = stat.st_size
            info["last_modified"] = datetime.fromtimestamp(stat.st_mtime).isoformat()
        return info

    def list_all_templates(self) -> list[dict]:
        result = []
        for order_type in ORDER_TYPES:
            result.append(self.get_template_info(order_type))
        return result

    def get_template_variables(self) -> list[dict]:
        """Возвращает список всех доступных переменных для шаблонов с описаниями"""
        return [
            {"name": "{order_number}", "description": "Номер приказа", "category": "Приказ"},
            {"name": "{order_date}", "description": "Дата приказа (ДД.ММ.ГГГГ)", "category": "Приказ"},
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

            {"name": "{contract_number}", "description": "Номер контракта", "category": "Прочее"},
        ]


order_service = OrderService()
