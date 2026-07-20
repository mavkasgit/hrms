"""Repository for used_logout_jti (OIDC back-channel logout replay protection)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.logout_jti import UsedLogoutJti


class LogoutJtiRepository:
    async def is_used(self, db: AsyncSession, jti: str) -> bool:
        result = await db.execute(
            select(UsedLogoutJti.jti).where(UsedLogoutJti.jti == jti)
        )
        return result.first() is not None

    async def mark_used(
        self, db: AsyncSession, jti: str, *, expires_at: datetime
    ) -> None:
        """Зафиксировать jti как потреблённый. PK-конфликт = replay (наверху → 400)."""
        db.add(UsedLogoutJti(jti=jti, expires_at=expires_at))
        await db.flush()

    async def delete_expired(
        self, db: AsyncSession, *, now: datetime | None = None
    ) -> int:
        """Удалить jti с истёкшим exp токена (replay после exp невозможен)."""
        ts = now or datetime.now(timezone.utc)
        result = await db.execute(
            delete(UsedLogoutJti).where(UsedLogoutJti.expires_at <= ts)
        )
        await db.flush()
        return result.rowcount or 0
