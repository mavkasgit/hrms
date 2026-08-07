from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.notification import Notification


class NotificationRepository:
    async def list_drafts(self, db: AsyncSession) -> list[Notification]:
        """Список черновиков уведомлений (is_draft) с типами и сотрудниками — без N+1."""
        result = await db.execute(
            select(Notification)
            .options(joinedload(Notification.notification_type), joinedload(Notification.employee))
            .where(Notification.is_draft.is_(True))
        )
        return list(result.unique().scalars().all())

    async def get_draft_by_id(self, db: AsyncSession, notification_id: int) -> Optional[Notification]:
        """Черновик уведомления по id (только is_draft=True)."""
        result = await db.execute(
            select(Notification)
            .options(joinedload(Notification.notification_type))
            .where(Notification.id == notification_id, Notification.is_draft.is_(True))
        )
        return result.unique().scalar_one_or_none()
