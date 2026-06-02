import asyncio
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import DuplicateError, HRMSException
from app.core.paths import storage_path
from app.models.order_type import OrderType
from app.repositories.order_repository import OrderRepository
from app.repositories.order_type_repository import OrderTypeRepository
from app.schemas.order_type import OrderTypeCreate, OrderTypeUpdate

from app.services.order_document_service import get_template_path

DEFAULT_ORDER_TYPES: list[dict[str, Any]] = [
    {
        "code": "hire",
        "name": "Прием на работу",
        "show_in_orders_page": True,
        "template_filename": "prikaz_priem.docx",
        "field_schema": [
            {"key": "hire_date", "label": "Дата приема", "type": "date", "required": False, "enabled": True},
            {"key": "trial_end", "label": "Конец испытательного срока", "type": "date", "required": False, "enabled": True},
            {"key": "contract_start", "label": "Начало", "type": "date", "required": False, "enabled": True},
            {"key": "contract_end", "label": "Конец", "type": "date", "required": False, "enabled": True},
            {"key": "contract_number", "label": "Номер", "type": "text", "required": False, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "к",
    },
    {
        "code": "dismissal",
        "name": "Увольнение",
        "show_in_orders_page": True,
        "template_filename": "prikaz_uvolnenie.docx",
        "field_schema": [
            {"key": "dismissal_date", "label": "Дата увольнения", "type": "date", "required": False, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "к",
    },
    {
        "code": "transfer",
        "name": "Перевод",
        "show_in_orders_page": True,
        "template_filename": "prikaz_perevod.docx",
        "field_schema": [
            {"key": "new_position", "label": "Новая должность", "type": "select", "required": False, "enabled": True, "entity": "position"},
            {"key": "new_contract_start", "label": "Начало", "type": "date", "required": False, "enabled": True},
            {"key": "new_contract_end", "label": "Конец", "type": "date", "required": False, "enabled": True},
            {"key": "new_contract_number", "label": "Номер", "type": "text", "required": False, "enabled": True},
            {"key": "new_contract_years", "label": "Срок (лет)", "type": "number", "required": False, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "к",
    },
    {
        "code": "contract_extension",
        "name": "Продление контракта",
        "show_in_orders_page": True,
        "template_filename": "prikaz_prodlenie_kontrakta.docx",
        "field_schema": [
            {"key": "old_contract_start", "label": "Начало", "type": "date", "required": False, "enabled": True},
            {"key": "old_contract_end", "label": "Конец", "type": "date", "required": False, "enabled": True},
            {"key": "old_contract_number", "label": "Номер", "type": "text", "required": False, "enabled": True},
            {"key": "new_contract_start", "label": "Начало", "type": "date", "required": False, "enabled": True},
            {"key": "new_contract_end", "label": "Конец", "type": "date", "required": False, "enabled": True},
            {"key": "new_contract_number", "label": "Номер", "type": "text", "required": False, "enabled": True},
            {"key": "new_contract_years", "label": "Срок (лет)", "type": "number", "required": False, "enabled": True},
            {"key": "trial_end", "label": "Конец испытательного срока", "type": "date", "required": False, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "к",
    },
    {
        "code": "new_contract",
        "name": "Заключение нового контракта",
        "show_in_orders_page": True,
        "template_filename": "prikaz_zakluchenie_kontrakta.docx",
        "field_schema": [
            {"key": "old_contract_start", "label": "Начало", "type": "date", "required": False, "enabled": True},
            {"key": "old_contract_end", "label": "Конец", "type": "date", "required": False, "enabled": True},
            {"key": "old_contract_number", "label": "Номер", "type": "text", "required": False, "enabled": True},
            {"key": "new_contract_start", "label": "Начало", "type": "date", "required": False, "enabled": True},
            {"key": "new_contract_end", "label": "Конец", "type": "date", "required": False, "enabled": True},
            {"key": "new_contract_number", "label": "Номер", "type": "text", "required": False, "enabled": True},
            {"key": "new_contract_years", "label": "Срок (лет)", "type": "number", "required": False, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "к",
    },
    {
        "code": "vacation_paid",
        "name": "Отпуск трудовой",
        "show_in_orders_page": False,
        "template_filename": "prikaz_otpusk_trudovoy.docx",
        "field_schema": [
            {"key": "vacation_start", "label": "Дата начала", "type": "date", "required": True, "enabled": True},
            {"key": "vacation_end", "label": "Дата окончания", "type": "date", "required": True, "enabled": True},
            {"key": "vacation_days", "label": "Количество дней", "type": "number", "required": True, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "л",
    },
    {
        "code": "vacation_unpaid",
        "name": "Отпуск за свой счет",
        "show_in_orders_page": False,
        "template_filename": "prikaz_otpusk_svoy_schet.docx",
        "field_schema": [
            {"key": "vacation_start", "label": "Дата начала", "type": "date", "required": True, "enabled": True},
            {"key": "vacation_end", "label": "Дата окончания", "type": "date", "required": True, "enabled": True},
            {"key": "vacation_days", "label": "Количество дней", "type": "number", "required": True, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "к",
    },
    {
        "code": "vacation_unpaid_group",
        "name": "Отпуск за свой счет (групповой)",
        "show_in_orders_page": False,
        "template_filename": "template__order__vacation_unpaid_group.docx",
        "field_schema": [
            {"key": "vacation_start", "label": "Дата начала", "type": "date", "required": True, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_vacation_unpaid_group_{vacation_start}.docx",
        "letter": "к",
    },
    {
        "code": "weekend_call",
        "name": "Вызов в выходной",
        "show_in_orders_page": False,
        "template_filename": "prikaz_vyzov_v_vyhodnoy.docx",
        "field_schema": [
            {"key": "call_date", "label": "Дата вызова", "type": "date", "required": False, "enabled": True},
            {"key": "call_date_start", "label": "Дата начала", "type": "date", "required": False, "enabled": True},
            {"key": "call_date_end", "label": "Дата окончания", "type": "date", "required": False, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "к",
    },
    {
        "code": "weekend_call_group",
        "name": "Вызов в выходной (групповой)",
        "show_in_orders_page": False,
        "template_filename": "template__order__weekend_call_group.docx",
        "field_schema": [
            {"key": "call_date_start", "label": "Дата начала", "type": "date", "required": True, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_weekend_call_group_{call_date_start}.docx",
        "letter": "к",
    },
    {
        "code": "vacation_recall",
        "name": "Отзыв из отпуска",
        "show_in_orders_page": False,
        "template_filename": "prikaz_otzyv_iz_otpuska.docx",
        "field_schema": [
            {"key": "recall_date", "label": "Дата отзыва", "type": "date", "required": True, "enabled": True},
            {"key": "old_vacation_start", "label": "Дата начала отпуска", "type": "date", "required": True, "enabled": True},
            {"key": "old_vacation_end", "label": "Дата окончания отпуска", "type": "date", "required": True, "enabled": True},
            {"key": "old_vacation_days", "label": "Количество дней отпуска", "type": "number", "required": True, "enabled": True},
            {"key": "reason", "label": "Основание", "type": "text", "required": False, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "л",
    },
    {
        "code": "vacation_postpone",
        "name": "Перенос отпуска",
        "show_in_orders_page": False,
        "template_filename": "prikaz_perenos_otpuska.docx",
        "field_schema": [
            {"key": "old_vacation_start", "label": "Старая дата начала", "type": "date", "required": True, "enabled": True},
            {"key": "old_vacation_end", "label": "Старая дата окончания", "type": "date", "required": True, "enabled": True},
            {"key": "new_vacation_start", "label": "Новая дата начала", "type": "date", "required": True, "enabled": True},
            {"key": "new_vacation_end", "label": "Новая дата окончания", "type": "date", "required": True, "enabled": True},
            {"key": "vacation_days", "label": "Количество дней", "type": "number", "required": True, "enabled": True},
            {"key": "reason", "label": "Основание", "type": "text", "required": False, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "л",
    },
    {
        "code": "vacation_extension",
        "name": "Продление отпуска",
        "show_in_orders_page": False,
        "template_filename": "prikaz_prodlenie_otpuska.docx",
        "field_schema": [
            {"key": "vacation_start", "label": "Дата начала отпуска", "type": "date", "required": True, "enabled": True},
            {"key": "vacation_end", "label": "Дата окончания отпуска", "type": "date", "required": True, "enabled": True},
            {"key": "vacation_days", "label": "Количество дней отпуска", "type": "number", "required": True, "enabled": True},
            {"key": "sick_start_date", "label": "Дата начала больничного", "type": "date", "required": True, "enabled": True},
            {"key": "sick_end_date", "label": "Дата окончания больничного", "type": "date", "required": True, "enabled": True},
            {"key": "comment", "label": "Комментарий", "type": "text", "required": False, "enabled": True},
        ],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx",
        "letter": "л",
    },
    {
        "code": "general_order",
        "name": "Приказ по основной деятельности",
        "show_in_orders_page": True,
        "template_filename": "template__order__general_order.docx",
        "field_schema": [],
        "filename_pattern": "Приказ_№{order_number}_{order_type_code}_{order_date}.docx",
        "letter": None,
    },
]

STANDARD_ORDER_CODES = frozenset(item["code"] for item in DEFAULT_ORDER_TYPES)


class OrderTypeService:
    def __init__(self):
        self.order_type_repo = OrderTypeRepository()
        self.order_repo = OrderRepository()

    async def ensure_default_order_types(self, db: AsyncSession) -> list[OrderType]:
        existing = await self.order_type_repo.list_all(db)
        existing_by_code = {item.code: item for item in existing}
        existing_by_name = {item.name: item for item in existing}
        changed = False

        for item in DEFAULT_ORDER_TYPES:
            current = existing_by_code.get(item["code"])
            display_name = f"Шаблон - {item['name']}.docx"
            if not current:
                # Healing path: тип с нужным name уже есть, но с неверным code.
                by_name = existing_by_name.get(item["name"])
                if by_name:
                    if by_name.code != item["code"]:
                        owner = existing_by_code.get(item["code"]) or await self.order_type_repo.get_by_code(
                            db, item["code"]
                        )
                        if owner and owner.id != by_name.id:
                            current = owner
                        else:
                            await self.order_type_repo.update(db, by_name, {"code": item["code"]})
                            changed = True
                            by_name.code = item["code"]
                            existing_by_code[item["code"]] = by_name
                            current = by_name
                    else:
                        current = by_name
                else:
                    created: OrderType | None = None
                    try:
                        # Savepoint: защищаемся от конкурентных вставок.
                        async with db.begin_nested():
                            created = await self.order_type_repo.create(
                                db, {**item, "display_name": display_name}
                            )
                    except IntegrityError:
                        created = (
                            await self.order_type_repo.get_by_code(db, item["code"])
                            or await self.order_type_repo.get_by_name(db, item["name"])
                        )
                    if not created:
                        raise RuntimeError(
                            f"Failed to ensure default order type for code={item['code']}, name={item['name']}"
                        )
                    existing_by_code[created.code] = created
                    existing_by_name[created.name] = created
                    current = created
                    if created.code == item["code"]:
                        changed = True

            updates: dict[str, Any] = {}
            for key in ("name", "show_in_orders_page", "filename_pattern", "letter"):
                if getattr(current, key) != item.get(key):
                    updates[key] = item.get(key)
            if not current.display_name or current.display_name.startswith("Шаблон - "):
                updates["display_name"] = display_name
            # Sync field_schema for known default types
            current_schema = current.field_schema or []
            if current_schema != item.get("field_schema", []):
                updates["field_schema"] = item.get("field_schema", [])
            if updates:
                old_name = current.name
                updated = await self.order_type_repo.update(db, current, updates)
                existing_by_name.pop(old_name, None)
                existing_by_name[updated.name] = updated
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

        # Стандартные типы приказов нельзя редактировать — их поля задаются миграцией/кодом.
        # Разрешены только загрузка/удаление шаблона и обновление field_schema.
        if order_type.code in STANDARD_ORDER_CODES:
            blocked = set(payload.keys()) - {"template_filename", "field_schema"}
            if blocked:
                raise HRMSException(
                    f"Нельзя изменить стандартный тип приказа. Заблокированные поля: {', '.join(sorted(blocked))}",
                    "standard_order_type_readonly",
                    status_code=403,
                )
            # Для стандартных типов разрешаем только template_filename (через upload_template)
            # Если пришёл пустой payload — просто возвращаем текущее состояние
            if not payload:
                return self._serialize_order_type(order_type)

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
            recent_orders = await self.order_repo.get_recent_by_order_type(db, order_type_id, limit=5)
            numbers = [o.order_number for o in recent_orders]
            raise HRMSException(
                f"Нельзя удалить тип приказа, который уже используется. Связанные приказы: {', '.join(numbers)}",
                "order_type_in_use",
                status_code=409,
            )

        template_path = get_template_path(order_type)
        if template_path.exists():
            template_path.unlink()

        await self.order_type_repo.delete(db, order_type)
        await db.commit()

    async def upload_template(self, db: AsyncSession, order_type_id: int, filename: str, content: bytes) -> dict[str, Any]:
        order_type = await self.get_order_type(db, order_type_id)
        storage_name = self._normalize_template_filename(filename, order_type.code)
        display_name = f"Шаблон - {order_type.name}.docx"
        template_path = Path(settings.TEMPLATES_PATH) / storage_name
        template_path.parent.mkdir(parents=True, exist_ok=True)

        # On Windows, the file may be locked by another process (e.g. OnlyOffice).
        # Retry a few times before giving up.
        for attempt in range(3):
            try:
                with open(template_path, "wb") as file_obj:
                    file_obj.write(content)
                break
            except PermissionError:
                if attempt == 2:
                    raise HTTPException(
                        status_code=409,
                        detail="Файл шаблона заблокирован другим процессом (возможно, открыт в редакторе). Закройте файл и повторите попытку.",
                    )
                await asyncio.sleep(0.5)

        await self.order_type_repo.update(db, order_type, {
            "template_filename": storage_name,
            "display_name": display_name,
        })

        # Auto-extract placeholders and suggest field schema if empty
        if not order_type.field_schema or len(order_type.field_schema) == 0:
            from app.services.template_placeholder_extractor import (
                extract_placeholders_from_docx,
                suggest_field_schema,
            )
            placeholders = extract_placeholders_from_docx(template_path)
            suggested_schema = suggest_field_schema(placeholders)
            if suggested_schema:
                await self.order_type_repo.update(db, order_type, {
                    "field_schema": suggested_schema,
                })

        await db.commit()
        return self._serialize_order_type(order_type)

    async def delete_template(self, db: AsyncSession, order_type_id: int) -> None:
        order_type = await self.get_order_type(db, order_type_id)
        template_path = get_template_path(order_type)
        if template_path.exists():
            template_path.unlink()
        await self.order_type_repo.update(db, order_type, {"template_filename": None})
        await db.commit()

    async def bulk_upload_templates(self, db: AsyncSession, files: list[Any]) -> dict[str, Any]:
        results: dict[str, Any] = {"uploaded": 0, "skipped": 0, "errors": []}
        for file in files:
            if not file.filename or not file.filename.endswith(".docx"):
                results["skipped"] += 1
                results["errors"].append(f"{file.filename or 'unknown'}: только .docx")
                continue
            code = Path(file.filename).stem
            order_type = await self.order_type_repo.get_by_code(db, code)
            if not order_type:
                results["skipped"] += 1
                results["errors"].append(f"{file.filename}: тип приказа с кодом '{code}' не найден")
                continue
            try:
                content = await file.read()
                safe_filename = self._normalize_template_filename(file.filename, order_type.code)
                template_path = Path(settings.TEMPLATES_PATH) / safe_filename
                template_path.parent.mkdir(parents=True, exist_ok=True)
                with open(template_path, "wb") as file_obj:
                    file_obj.write(content)
                await self.order_type_repo.update(db, order_type, {"template_filename": safe_filename})
                results["uploaded"] += 1
            except Exception as e:
                results["errors"].append(f"{file.filename}: {str(e)}")
                results["skipped"] += 1
        await db.commit()
        return results

    def _serialize_order_type(self, order_type: OrderType) -> dict[str, Any]:
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

    def _normalize_template_filename(self, original_filename: str, code: str) -> str:
        ext = Path(original_filename).suffix or ".docx"
        return f"template__order__{code}{ext.lower()}"
