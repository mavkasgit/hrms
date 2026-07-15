"""Repository for User lookups and Telegram identity linking."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import SSO_BYPASS_HASH
from app.models.user import User


class UserRepository:
    async def get_by_username(self, db: AsyncSession, username: str) -> User | None:
        result = await db.execute(
            select(User).where(User.username == username, User.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def get_by_telegram_id(self, db: AsyncSession, telegram_id: int) -> User | None:
        result = await db.execute(
            select(User).where(User.telegram_id == telegram_id, User.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def get_by_phone(self, db: AsyncSession, phone: str) -> User | None:
        result = await db.execute(
            select(User).where(User.phone == phone, User.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def get_by_invite_code(self, db: AsyncSession, invite_code: str) -> User | None:
        result = await db.execute(
            select(User).where(User.invite_code == invite_code, User.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def link_telegram(
        self,
        db: AsyncSession,
        user: User,
        telegram_id: int,
        telegram_username: str | None = None,
        phone: str | None = None,
    ) -> User:
        user.telegram_id = telegram_id
        user.telegram_username = telegram_username
        user.invite_code = None
        if phone is not None:
            user.phone = phone
        db.add(user)
        await db.flush()
        await db.refresh(user)
        return user

    async def unlink_telegram(self, db: AsyncSession, user: User) -> User:
        user.telegram_id = None
        user.telegram_username = None
        db.add(user)
        await db.flush()
        await db.refresh(user)
        return user

    async def get_by_id(self, db: AsyncSession, user_id: int) -> User | None:
        result = await db.execute(
            select(User).where(User.id == user_id, User.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def create_telegram_user(
        self,
        db: AsyncSession,
        *,
        telegram_id: int,
        username: str,
        full_name: str,
        role: str,
        phone: str | None = None,
        telegram_username: str | None = None,
    ) -> User:
        user = User(
            username=username,
            full_name=full_name,
            role=role,
            password_hash=SSO_BYPASS_HASH,
            telegram_id=telegram_id,
            telegram_username=telegram_username,
            phone=phone,
            is_deleted=False,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        return user
