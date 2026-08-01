"""Сервис внутренних уведомлений интерфейса (#18).

Уведомление живёт до закрытия пользователем, состояние в БД. Создаются по
конкретным событиям (сейчас — изменение приказа задним числом, подсистема
готова и под другие события). Дедупликация: на (тип, объект, пользователя)
существует не более одного незакрытого уведомления — приказ правили пять раз,
пользователь видит одно.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.internal_notification import InternalNotification
from app.models.user import User


class InternalNotificationService:
    async def create_for_users(
        self,
        db: AsyncSession,
        user_ids: List[int],
        notification_type: str,
        title: str,
        text: Optional[str] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
    ) -> List[InternalNotification]:
        """Создаёт уведомление для списка пользователей с дедупликацией.

        Дедупликация: если у пользователя уже есть незакрытое уведомление
        с тем же (тип, объект) — не создаём ещё одно, а лишь возвращаем его.
        """
        created: List[InternalNotification] = []
        for user_id in set(user_ids):
            existing = await self.find_open(db, user_id, notification_type, entity_type, entity_id)
            if existing:
                created.append(existing)
                continue
            notification = InternalNotification(
                user_id=user_id,
                notification_type=notification_type,
                title=title,
                text=text,
                entity_type=entity_type,
                entity_id=entity_id,
            )
            db.add(notification)
            created.append(notification)
        await db.flush()
        for notification in created:
            if not notification.id:
                await db.refresh(notification)
        return created

    async def find_open(
        self,
        db: AsyncSession,
        user_id: int,
        notification_type: str,
        entity_type: Optional[str],
        entity_id: Optional[int],
    ) -> Optional[InternalNotification]:
        stmt = select(InternalNotification).where(
            InternalNotification.user_id == user_id,
            InternalNotification.notification_type == notification_type,
            InternalNotification.closed_at.is_(None),
        )
        if entity_type is not None:
            stmt = stmt.where(InternalNotification.entity_type == entity_type)
        if entity_id is not None:
            stmt = stmt.where(InternalNotification.entity_id == entity_id)
        stmt = stmt.order_by(InternalNotification.id.desc()).limit(1)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_user(
        self,
        db: AsyncSession,
        user_id: int,
        limit: int = 50,
        only_unclosed: bool = False,
    ) -> List[InternalNotification]:
        """Список уведомлений пользователя: незакрытые первыми, свежие сверху."""
        stmt = select(InternalNotification).where(InternalNotification.user_id == user_id)
        if only_unclosed:
            stmt = stmt.where(InternalNotification.closed_at.is_(None))
        stmt = stmt.order_by(
            InternalNotification.closed_at.is_(None).desc(),
            InternalNotification.created_at.desc(),
        ).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def unread_count(self, db: AsyncSession, user_id: int) -> int:
        stmt = select(func.count()).select_from(InternalNotification).where(
            InternalNotification.user_id == user_id,
            InternalNotification.read_at.is_(None),
            InternalNotification.closed_at.is_(None),
        )
        result = await db.execute(stmt)
        return int(result.scalar() or 0)

    async def mark_read(self, db: AsyncSession, notification_id: int, user_id: int) -> Optional[InternalNotification]:
        notification = await self.get_mine(db, notification_id, user_id)
        if not notification:
            return None
        if not notification.read_at:
            notification.read_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(notification)
        return notification

    async def close(self, db: AsyncSession, notification_id: int, user_id: int) -> Optional[InternalNotification]:
        """Закрыть уведомление — оно исчезает из списка навсегда."""
        notification = await self.get_mine(db, notification_id, user_id)
        if not notification:
            return None
        notification.closed_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(notification)
        return notification

    async def get_mine(
        self, db: AsyncSession, notification_id: int, user_id: int
    ) -> Optional[InternalNotification]:
        result = await db.execute(
            select(InternalNotification).where(
                InternalNotification.id == notification_id,
                InternalNotification.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def user_ids_by_username(self, db: AsyncSession, usernames: List[str]) -> List[int]:
        if not usernames:
            return []
        result = await db.execute(
            select(User.id).where(
                User.username.in_(usernames),
                User.is_deleted.is_(False),
                User.is_active.is_(True),
            )
        )
        return list(result.scalars().all())

    async def admin_user_ids(self, db: AsyncSession) -> List[int]:
        """Адресаты по умолчанию: активные администраторы."""
        result = await db.execute(
            select(User.id).where(
                User.role == "admin",
                User.is_deleted.is_(False),
                User.is_active.is_(True),
            )
        )
        return list(result.scalars().all())

    async def notify_admins_about_absence_change(
        self,
        db: AsyncSession,
        employee_name: str,
        absence_type: str,
        start_date: str,
        end_date: str,
        order_id: Optional[int] = None,
    ) -> List[InternalNotification]:
        """Событие «приказ изменился» (#18): отпуск/больничный изменён,
        табель мог получить новое авто-значение. Уведомляем всех админов
        (дедупликация по объекту)."""
        user_ids = await self.admin_user_ids(db)
        if not user_ids:
            return []
        type_label = "отпуск" if absence_type == "vacation" else "больничный"
        return await self.create_for_users(
            db,
            user_ids,
            notification_type="absence_changed",
            title=f"Изменён {type_label}: {employee_name}",
            text=f"{employee_name}: {type_label} с {start_date} по {end_date}. "
            "Проверьте табель — авто-значение могло измениться.",
            entity_type="absence",
            entity_id=order_id,
        )


internal_notification_service = InternalNotificationService()
