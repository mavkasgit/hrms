"""Repository for Telegram login signature replay protection."""

from datetime import datetime, timezone, timedelta
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.models.used_signature import UsedTelegramSignature


class SignatureRepository:
    async def is_used(self, db: AsyncSession, signature_hash: str) -> bool:
        result = await db.execute(
            select(UsedTelegramSignature).where(
                UsedTelegramSignature.signature_hash == signature_hash
            )
        )
        return result.scalar_one_or_none() is not None

    async def mark_used(self, db: AsyncSession, signature_hash: str) -> UsedTelegramSignature:
        sig = UsedTelegramSignature(signature_hash=signature_hash)
        db.add(sig)
        await db.flush()
        await db.refresh(sig)
        return sig

    async def cleanup_expired(self, db: AsyncSession, max_age_seconds: int) -> int:
        threshold = datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds)
        stmt = delete(UsedTelegramSignature).where(
            UsedTelegramSignature.created_at < threshold
        )
        result = await db.execute(stmt)
        return result.rowcount
