"""Repository for append-only user_login_events."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_login_event import UserLoginEvent


class LoginEventRepository:
    async def create_event(
        self,
        db: AsyncSession,
        *,
        event_type: str,
        success: bool,
        user_id: int | None = None,
        username_attempted: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        session_id: UUID | None = None,
        details: dict | None = None,
    ) -> UserLoginEvent:
        event = UserLoginEvent(
            user_id=user_id,
            username_attempted=username_attempted,
            event_type=event_type,
            success=success,
            ip_address=ip_address,
            user_agent=user_agent,
            session_id=session_id,
            details=details,
        )
        db.add(event)
        await db.flush()
        await db.refresh(event)
        return event

    async def list_for_user(
        self,
        db: AsyncSession,
        user_id: int,
        since: datetime,
        limit: int = 50,
    ) -> list[UserLoginEvent]:
        result = await db.execute(
            select(UserLoginEvent)
            .where(
                UserLoginEvent.user_id == user_id,
                UserLoginEvent.created_at >= since,
            )
            .order_by(UserLoginEvent.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
