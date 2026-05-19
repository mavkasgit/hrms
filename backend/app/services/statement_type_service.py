import asyncio
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import DuplicateError, HRMSException
from app.models.statement_type import StatementType

DEFAULT_STATEMENT_TYPES: list[dict[str, Any]] = [
    {
        "code": "personal",
        "name": "Личное заявление",
        "template_filename": None,
        "field_schema": [],
        "filename_pattern": "Заявление_№{doc_number}_{doc_date}.docx",
    },
    {
        "code": "transfer",
        "name": "Заявление о переводе",
        "template_filename": None,
        "field_schema": [
            {"key": "transfer_date", "label": "Дата перевода", "type": "date", "required": False},
            {"key": "transfer_reason", "label": "Основание", "type": "textarea", "required": False},
        ],
        "filename_pattern": "Заявление_№{doc_number}_{doc_date}.docx",
    },
    {
        "code": "dismissal",
        "name": "Заявление об увольнении",
        "template_filename": None,
        "field_schema": [
            {"key": "dismissal_date", "label": "Дата увольнения", "type": "date", "required": True},
        ],
        "filename_pattern": "Заявление_№{doc_number}_{doc_date}.docx",
    },
    {
        "code": "vacation",
        "name": "Заявление на отпуск",
        "template_filename": None,
        "field_schema": [
            {"key": "vacation_start", "label": "Дата начала", "type": "date", "required": True},
            {"key": "vacation_end", "label": "Дата окончания", "type": "date", "required": True},
            {"key": "vacation_days", "label": "Количество дней", "type": "number", "required": True},
        ],
        "filename_pattern": "Заявление_№{doc_number}_{doc_date}.docx",
    },
    {
        "code": "other",
        "name": "Другое",
        "template_filename": None,
        "field_schema": [],
        "filename_pattern": "Заявление_№{doc_number}_{doc_date}.docx",
    },
]

STANDARD_STATEMENT_CODES = frozenset(item["code"] for item in DEFAULT_STATEMENT_TYPES)


class StatementTypeService:
    async def ensure_default_statement_types(self, db: AsyncSession) -> list[StatementType]:
        from sqlalchemy import select
        result = await db.execute(select(StatementType))
        existing = list(result.scalars().all())
        existing_by_code = {item.code: item for item in existing}
        existing_by_name = {item.name: item for item in existing}
        changed = False

        for item in DEFAULT_STATEMENT_TYPES:
            current = existing_by_code.get(item["code"])
            display_name = f"Шаблон - {item['name']}.docx"
            if not current:
                by_name = existing_by_name.get(item["name"])
                if by_name:
                    if by_name.code != item["code"]:
                        owner = existing_by_code.get(item["code"])
                        if owner and owner.id != by_name.id:
                            current = owner
                        else:
                            by_name.code = item["code"]
                            changed = True
                            existing_by_code[item["code"]] = by_name
                            current = by_name
                    else:
                        current = by_name
                else:
                    created: StatementType | None = None
                    try:
                        async with db.begin_nested():
                            created = StatementType(**{**item, "display_name": display_name})
                            db.add(created)
                            await db.flush()
                    except IntegrityError:
                        result = await db.execute(
                            select(StatementType).where(
                                (StatementType.code == item["code"]) | (StatementType.name == item["name"])
                            )
                        )
                        created = result.scalars().first()
                    if not created:
                        raise RuntimeError(
                            f"Failed to ensure default statement type for code={item['code']}, name={item['name']}"
                        )
                    existing_by_code[created.code] = created
                    existing_by_name[created.name] = created
                    current = created
                    if created.code == item["code"]:
                        changed = True

            updates: dict[str, Any] = {}
            for key in ("name", "filename_pattern"):
                if getattr(current, key) != item.get(key):
                    updates[key] = item.get(key)
            if not current.display_name or current.display_name.startswith("Шаблон - "):
                updates["display_name"] = display_name
            if updates:
                old_name = current.name
                for k, v in updates.items():
                    setattr(current, k, v)
                existing_by_name.pop(old_name, None)
                existing_by_name[current.name] = current
                changed = True

        if changed:
            await db.commit()

        return list(existing_by_code.values())

    async def get_statement_types(
        self,
        db: AsyncSession,
        active_only: bool = True,
    ) -> list[dict[str, Any]]:
        await self.ensure_default_statement_types(db)
        from sqlalchemy import select
        query = select(StatementType)
        if active_only:
            query = query.where(StatementType.is_active == True)
        query = query.order_by(StatementType.name)
        result = await db.execute(query)
        items = list(result.scalars().all())
        return [self._serialize_statement_type(item) for item in items]

    async def get_statement_type(self, db: AsyncSession, statement_type_id: int) -> StatementType:
        stmt_type = await db.get(StatementType, statement_type_id)
        if not stmt_type:
            raise HRMSException("Тип заявления не найден", "statement_type_not_found", status_code=404)
        return stmt_type

    async def create_statement_type(self, db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
        from sqlalchemy import select
        if await db.execute(select(StatementType).where(StatementType.code == data["code"])):
            raise DuplicateError(f"Тип заявления с кодом {data['code']} уже существует", "duplicate_statement_type_code")
        if await db.execute(select(StatementType).where(StatementType.name == data["name"])):
            raise DuplicateError(f"Тип заявления с названием {data['name']} уже существует", "duplicate_statement_type_name")

        created = StatementType(**data)
        db.add(created)
        await db.commit()
        await db.refresh(created)
        return self._serialize_statement_type(created)

    async def update_statement_type(self, db: AsyncSession, statement_type_id: int, data: dict[str, Any]) -> dict[str, Any]:
        stmt_type = await self.get_statement_type(db, statement_type_id)

        # Standard types are read-only except for template_filename
        if stmt_type.code in STANDARD_STATEMENT_CODES:
            blocked = set(data.keys()) - {"template_filename"}
            if blocked:
                raise HRMSException(
                    f"Нельзя изменить стандартный тип заявления. Заблокированные поля: {', '.join(sorted(blocked))}",
                    "standard_statement_type_readonly",
                    status_code=403,
                )
            if not data:
                return self._serialize_statement_type(stmt_type)

        new_name = data.get("name")
        if new_name and new_name != stmt_type.name:
            from sqlalchemy import select
            existing = (await db.execute(
                select(StatementType).where(StatementType.name == new_name)
            )).scalars().first()
            if existing and existing.id != stmt_type.id:
                raise DuplicateError(f"Тип заявления с названием {new_name} уже существует", "duplicate_statement_type_name")

        for k, v in data.items():
            setattr(stmt_type, k, v)
        await db.commit()
        await db.refresh(stmt_type)
        return self._serialize_statement_type(stmt_type)

    async def delete_statement_type(self, db: AsyncSession, statement_type_id: int) -> None:
        stmt_type = await self.get_statement_type(db, statement_type_id)
        from sqlalchemy import func, select
        count_result = await db.execute(
            select(func.count()).select_from(select(1).where(
                __import__('app.models.statement', fromlist=['Statement']).Statement.statement_type_id == statement_type_id
            ).subquery())
        )
        # Simpler approach: just check relationship
        from app.models.statement import Statement
        stmt_count = (await db.execute(select(func.count()).where(Statement.statement_type_id == statement_type_id))).scalar()
        if stmt_count > 0:
            raise HRMSException(
                "Нельзя удалить тип заявления, который уже используется",
                "statement_type_in_use",
                status_code=409,
            )

        template_path = self._get_template_path(stmt_type)
        if template_path.exists():
            template_path.unlink()

        await db.delete(stmt_type)
        await db.commit()

    async def upload_template(self, db: AsyncSession, statement_type_id: int, filename: str, content: bytes) -> dict[str, Any]:
        stmt_type = await self.get_statement_type(db, statement_type_id)
        storage_name = self._normalize_template_filename(filename, stmt_type.code)
        display_name = f"Шаблон - {stmt_type.name}.docx"
        template_path = Path(settings.TEMPLATES_PATH) / storage_name
        template_path.parent.mkdir(parents=True, exist_ok=True)

        for attempt in range(3):
            try:
                with open(template_path, "wb") as file_obj:
                    file_obj.write(content)
                break
            except PermissionError:
                if attempt == 2:
                    raise HTTPException(
                        status_code=409,
                        detail="Файл шаблона заблокирован другим процессом. Закройте файл и повторите попытку.",
                    )
                await asyncio.sleep(0.5)

        stmt_type.template_filename = storage_name
        stmt_type.display_name = display_name
        await db.commit()
        await db.refresh(stmt_type)
        return self._serialize_statement_type(stmt_type)

    async def delete_template(self, db: AsyncSession, statement_type_id: int) -> None:
        stmt_type = await self.get_statement_type(db, statement_type_id)
        template_path = self._get_template_path(stmt_type)
        if template_path.exists():
            template_path.unlink()
        stmt_type.template_filename = None
        await db.commit()

    def _serialize_statement_type(self, stmt_type: StatementType) -> dict[str, Any]:
        template_path = self._get_template_path(stmt_type)
        result = {
            "id": stmt_type.id,
            "code": stmt_type.code,
            "name": stmt_type.name,
            "is_active": stmt_type.is_active,
            "template_filename": stmt_type.template_filename,
            "display_name": stmt_type.display_name,
            "field_schema": stmt_type.field_schema or [],
            "filename_pattern": stmt_type.filename_pattern,
            "template_exists": template_path.exists(),
            "created_at": stmt_type.created_at,
            "updated_at": stmt_type.updated_at,
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
        return f"template__statement__{code}{ext.lower()}"

    def _get_template_path(self, stmt_type: StatementType) -> Path:
        if not stmt_type.template_filename:
            return Path(settings.TEMPLATES_PATH) / "__missing__.docx"
        return Path(settings.TEMPLATES_PATH) / stmt_type.template_filename


statement_type_service = StatementTypeService()


def get_template_path(stmt_type: StatementType) -> Path:
    """Get the template file path for a statement type."""
    return statement_type_service._get_template_path(stmt_type)
