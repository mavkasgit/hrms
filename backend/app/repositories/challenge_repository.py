"""Repository for Telegram bot login/link challenges."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
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
        poll_secret_hash: str = "",
    ) -> AuthLoginChallenge:
        challenge = AuthLoginChallenge(
            token=token,
            purpose=purpose,
            user_id=user_id,
            status="pending",
            expires_at=expires_at,
            poll_secret_hash=poll_secret_hash,
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

    async def get_by_id_for_update(
        self, db: AsyncSession, challenge_id: UUID
    ) -> AuthLoginChallenge | None:
        """Row lock for atomic poll consume (PostgreSQL FOR UPDATE)."""
        result = await db.execute(
            select(AuthLoginChallenge)
            .where(AuthLoginChallenge.id == challenge_id)
            .with_for_update()
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
        telegram_username: str | None = None,
    ) -> AuthLoginChallenge:
        challenge.status = "confirmed"
        challenge.telegram_id = telegram_id
        if telegram_username is not None:
            challenge.telegram_username = telegram_username
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

    async def try_consume_confirmed(
        self, db: AsyncSession, challenge_id: UUID
    ) -> AuthLoginChallenge | None:
        """
        Atomic single-use: UPDATE … WHERE status='confirmed' RETURNING *.
        Returns row only if this caller won the race (rowcount=1).
        """
        now = datetime.now(timezone.utc)
        result = await db.execute(
            update(AuthLoginChallenge)
            .where(
                AuthLoginChallenge.id == challenge_id,
                AuthLoginChallenge.status == "confirmed",
            )
            .values(status="consumed", consumed_at=now)
            .returning(AuthLoginChallenge)
        )
        row = result.scalar_one_or_none()
        if row is not None:
            await db.flush()
        return row
