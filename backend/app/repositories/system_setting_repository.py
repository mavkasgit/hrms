"""Репозиторий для key-value хранилища SystemSetting."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_setting import SystemSetting


class SystemSettingRepository:
    async def get(self, db: AsyncSession, key: str) -> Optional[SystemSetting]:
        result = await db.execute(
            select(SystemSetting).where(SystemSetting.key == key)
        )
        return result.scalar_one_or_none()

    async def get_value(self, db: AsyncSession, key: str) -> Optional[str]:
        row = await self.get(db, key)
        return row.value if row is not None else None

    async def get_all(self, db: AsyncSession) -> list[SystemSetting]:
        result = await db.execute(
            select(SystemSetting).order_by(SystemSetting.key)
        )
        return list(result.scalars().all())

    async def upsert(
        self,
        db: AsyncSession,
        key: str,
        value: Optional[str],
        *,
        updated_by: Optional[str] = None,
    ) -> SystemSetting:
        row = await self.get(db, key)
        if row is None:
            row = SystemSetting(key=key, value=value, updated_by=updated_by)
            db.add(row)
        else:
            row.value = value
            row.updated_at = datetime.now(timezone.utc)
            if updated_by is not None:
                row.updated_by = updated_by
        await db.flush()
        await db.refresh(row)
        return row

    async def delete(self, db: AsyncSession, key: str) -> bool:
        row = await self.get(db, key)
        if row is None:
            return False
        await db.delete(row)
        await db.flush()
        return True
