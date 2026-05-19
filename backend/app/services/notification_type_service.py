import asyncio
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import DuplicateError, HRMSException
from app.models.notification_type import NotificationType

DEFAULT_NOTIFICATION_TYPES: list[dict[str, Any]] = [
    {
        "code": "standard",
        "name": "Стандартное уведомление",
        "template_filename": None,
        "field_schema": [],
        "filename_pattern": "Уведомление_№{doc_number}_{doc_date}.docx",
    },
    {
        "code": "contract_extension",
        "name": "О продлении контракта",
        "template_filename": None,
        "field_schema": [
            {"key": "contract_new_end", "label": "Новая дата конца контракта", "type": "date", "required": True},
        ],
        "filename_pattern": "Уведомление_№{doc_number}_{doc_date}.docx",
    },
]

STANDARD_NOTIFICATION_CODES = frozenset(item["code"] for item in DEFAULT_NOTIFICATION_TYPES)


class NotificationTypeService:
    async def ensure_default_notification_types(self, db: AsyncSession) -> list[NotificationType]:
        from sqlalchemy import select
        result = await db.execute(select(NotificationType))
        existing = list(result.scalars().all())
        existing_by_code = {item.code: item for item in existing}
        existing_by_name = {item.name: item for item in existing}
        changed = False

        for item in DEFAULT_NOTIFICATION_TYPES:
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
                    created: NotificationType | None = None
                    try:
                        async with db.begin_nested():
                            created = NotificationType(**{**item, "display_name": display_name})
                            db.add(created)
                            await db.flush()
                    except IntegrityError:
                        result = await db.execute(
                            select(NotificationType).where(
                                (NotificationType.code == item["code"]) | (NotificationType.name == item["name"])
                            )
                        )
                        created = result.scalars().first()
                    if not created:
                        raise RuntimeError(
                            f"Failed to ensure default notification type for code={item['code']}, name={item['name']}"
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

    async def get_notification_types(
        self,
        db: AsyncSession,
        active_only: bool = True,
    ) -> list[dict[str, Any]]:
        await self.ensure_default_notification_types(db)
        from sqlalchemy import select
        query = select(NotificationType)
        if active_only:
            query = query.where(NotificationType.is_active == True)
        query = query.order_by(NotificationType.name)
        result = await db.execute(query)
        items = list(result.scalars().all())
        return [self._serialize_notification_type(item) for item in items]

    async def get_notification_type(self, db: AsyncSession, notification_type_id: int) -> NotificationType:
        n_type = await db.get(NotificationType, notification_type_id)
        if not n_type:
            raise HRMSException("Тип уведомления не найден", "notification_type_not_found", status_code=404)
        return n_type

    async def create_notification_type(self, db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
        from sqlalchemy import select
        if (await db.execute(select(NotificationType).where(NotificationType.code == data["code"]))).scalars().first():
            raise DuplicateError(f"Тип уведомления с кодом {data['code']} уже существует", "duplicate_notification_type_code")
        if (await db.execute(select(NotificationType).where(NotificationType.name == data["name"]))).scalars().first():
            raise DuplicateError(f"Тип уведомления с названием {data['name']} уже существует", "duplicate_notification_type_name")

        created = NotificationType(**data)
        db.add(created)
        await db.commit()
        await db.refresh(created)
        return self._serialize_notification_type(created)

    async def update_notification_type(self, db: AsyncSession, notification_type_id: int, data: dict[str, Any]) -> dict[str, Any]:
        n_type = await self.get_notification_type(db, notification_type_id)

        if n_type.code in STANDARD_NOTIFICATION_CODES:
            blocked = set(data.keys()) - {"template_filename"}
            if blocked:
                raise HRMSException(
                    f"Нельзя изменить стандартный тип уведомления. Заблокированные поля: {', '.join(sorted(blocked))}",
                    "standard_notification_type_readonly",
                    status_code=403,
                )
            if not data:
                return self._serialize_notification_type(n_type)

        new_name = data.get("name")
        if new_name and new_name != n_type.name:
            from sqlalchemy import select
            existing = (await db.execute(
                select(NotificationType).where(NotificationType.name == new_name)
            )).scalars().first()
            if existing and existing.id != n_type.id:
                raise DuplicateError(f"Тип уведомления с названием {new_name} уже существует", "duplicate_notification_type_name")

        for k, v in data.items():
            setattr(n_type, k, v)
        await db.commit()
        await db.refresh(n_type)
        return self._serialize_notification_type(n_type)

    async def delete_notification_type(self, db: AsyncSession, notification_type_id: int) -> None:
        n_type = await self.get_notification_type(db, notification_type_id)
        from sqlalchemy import func, select
        from app.models.notification import Notification
        n_count = (await db.execute(select(func.count()).where(Notification.notification_type_id == notification_type_id))).scalar()
        if n_count > 0:
            raise HRMSException(
                "Нельзя удалить тип уведомления, который уже используется",
                "notification_type_in_use",
                status_code=409,
            )

        template_path = self._get_template_path(n_type)
        if template_path.exists():
            template_path.unlink()

        await db.delete(n_type)
        await db.commit()

    async def upload_template(self, db: AsyncSession, notification_type_id: int, filename: str, content: bytes) -> dict[str, Any]:
        n_type = await self.get_notification_type(db, notification_type_id)
        storage_name = self._normalize_template_filename(filename, n_type.code)
        display_name = f"Шаблон - {n_type.name}.docx"
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

        n_type.template_filename = storage_name
        n_type.display_name = display_name
        await db.commit()
        await db.refresh(n_type)
        return self._serialize_notification_type(n_type)

    async def delete_template(self, db: AsyncSession, notification_type_id: int) -> None:
        n_type = await self.get_notification_type(db, notification_type_id)
        template_path = self._get_template_path(n_type)
        if template_path.exists():
            template_path.unlink()
        n_type.template_filename = None
        await db.commit()

    def _serialize_notification_type(self, n_type: NotificationType) -> dict[str, Any]:
        template_path = self._get_template_path(n_type)
        result = {
            "id": n_type.id,
            "code": n_type.code,
            "name": n_type.name,
            "is_active": n_type.is_active,
            "template_filename": n_type.template_filename,
            "display_name": n_type.display_name,
            "field_schema": n_type.field_schema or [],
            "filename_pattern": n_type.filename_pattern,
            "template_exists": template_path.exists(),
            "created_at": n_type.created_at,
            "updated_at": n_type.updated_at,
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
        return f"template__notification__{code}{ext.lower()}"

    def _get_template_path(self, n_type: NotificationType) -> Path:
        if not n_type.template_filename:
            return Path(settings.TEMPLATES_PATH) / "__missing__.docx"
        return Path(settings.TEMPLATES_PATH) / n_type.template_filename


notification_type_service = NotificationTypeService()


def get_template_path(n_type: NotificationType) -> Path:
    """Get the template file path for a notification type."""
    return notification_type_service._get_template_path(n_type)
