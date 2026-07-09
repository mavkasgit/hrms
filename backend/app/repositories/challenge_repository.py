"""Repository for Telegram bot login/link challenges."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_challenge import AuthLoginChallenge


class ChallengeRepository:
    async def create(
        self,
        db: AsyncSession,
        *,
        token: str,
        purpose: str,
        expires_at: datetime,
        user_id: int | None = None,
    ) -> AuthLoginChallenge:
        challenge = AuthLoginChallenge(
            token=token,
            purpose=purpose,
            user_id=user_id,
            status="pending",
            expires_at=expires_at,
        )
        db.add(challenge)
        await db.flush()
        await db.refresh(challenge)
        return challenge

    async def get_by_id(self, db: AsyncSession, challenge_id: UUID) -> AuthLoginChallenge | None:
        result = await db.execute(
            select(AuthLoginChallenge).where(AuthLoginChallenge.id == challenge_id)
        )
        return result.scalar_one_or_none()

    async def get_by_token(self, db: AsyncSession, token: str) -> AuthLoginChallenge | None:
        result = await db.execute(
            select(AuthLoginChallenge).where(AuthLoginChallenge.token == token)
        )
        return result.scalar_one_or_none()

    async def confirm(
        self,
        db: AsyncSession,
        challenge: AuthLoginChallenge,
        *,
        telegram_id: int,
    ) -> AuthLoginChallenge:
        challenge.status = "confirmed"
        challenge.telegram_id = telegram_id
        db.add(challenge)
        await db.flush()
        await db.refresh(challenge)
        return challenge

    async def mark_expired(
        self, db: AsyncSession, challenge: AuthLoginChallenge
    ) -> AuthLoginChallenge:
        challenge.status = "expired"
        db.add(challenge)
        await db.flush()
        await db.refresh(challenge)
        return challenge

    async def consume(self, db: AsyncSession, challenge: AuthLoginChallenge) -> AuthLoginChallenge:
        challenge.status = "consumed"
        challenge.consumed_at = datetime.now(timezone.utc)
        db.add(challenge)
        await db.flush()
        await db.refresh(challenge)
        return challenge
