"""Repository for user_sessions (active multi-device sessions)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_session import UserSession


class SessionRepository:
    async def create_session(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        expires_at: datetime,
        login_method: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
        device_label: str | None = None,
        session_id: UUID | None = None,
        last_seen_at: datetime | None = None,
    ) -> UserSession:
        now = datetime.now(timezone.utc)
        kwargs: dict = {
            "user_id": user_id,
            "expires_at": expires_at,
            "login_method": login_method,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "device_label": device_label,
            "last_seen_at": last_seen_at or now,
        }
        if session_id is not None:
            kwargs["id"] = session_id
        session = UserSession(**kwargs)
        db.add(session)
        await db.flush()
        await db.refresh(session)
        return session

    async def get_by_id(self, db: AsyncSession, session_id: UUID) -> UserSession | None:
        result = await db.execute(select(UserSession).where(UserSession.id == session_id))
        return result.scalar_one_or_none()

    async def list_active_for_user(self, db: AsyncSession, user_id: int) -> list[UserSession]:
        """Non-revoked sessions that have not expired yet."""
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(UserSession)
            .where(
                UserSession.user_id == user_id,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
            )
            .order_by(UserSession.last_seen_at.desc())
        )
        return list(result.scalars().all())

    async def revoke(
        self,
        db: AsyncSession,
        session_id: UUID,
        reason: str,
        when: datetime | None = None,
    ) -> UserSession | None:
        """Set revoked_at if still active. Returns updated row or None if missing."""
        session = await self.get_by_id(db, session_id)
        if session is None:
            return None
        if session.revoked_at is not None:
            return session
        session.revoked_at = when or datetime.now(timezone.utc)
        session.revoke_reason = reason
        db.add(session)
        await db.flush()
        await db.refresh(session)
        return session

    async def revoke_all_for_user(
        self,
        db: AsyncSession,
        user_id: int,
        reason: str,
        except_id: UUID | None = None,
        when: datetime | None = None,
    ) -> int:
        """Revoke all non-revoked sessions for user; optionally keep except_id. Returns count."""
        now = when or datetime.now(timezone.utc)
        conditions = [
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        ]
        if except_id is not None:
            conditions.append(UserSession.id != except_id)

        result = await db.execute(
            update(UserSession)
            .where(*conditions)
            .values(revoked_at=now, revoke_reason=reason)
            .returning(UserSession.id)
        )
        rows = result.fetchall()
        await db.flush()
        return len(rows)

    async def touch_last_seen(
        self,
        db: AsyncSession,
        session_id: UUID,
        when: datetime | None = None,
    ) -> None:
        """Unconditional last_seen_at write (throttle lives in service)."""
        ts = when or datetime.now(timezone.utc)
        await db.execute(
            update(UserSession)
            .where(UserSession.id == session_id)
            .values(last_seen_at=ts)
        )
        await db.flush()
