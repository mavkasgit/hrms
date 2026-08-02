"""Repository for User lookups and identity linking."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.user_auth import generate_avatar_seed
from app.models.user import User


class UserRepository:
    async def get_by_username(self, db: AsyncSession, username: str) -> User | None:
        result = await db.execute(
            select(User).where(User.username == username, User.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def get_by_authentik_sub(self, db: AsyncSession, authentik_sub: str) -> User | None:
        result = await db.execute(
            select(User).where(
                User.authentik_sub == authentik_sub,
                User.is_deleted == False,
            )
        )
        return result.scalar_one_or_none()

    async def link_authentik_sub(
        self,
        db: AsyncSession,
        user: User,
        authentik_sub: str,
    ) -> User:
        """Persist Authentik subject on local user (first successful OIDC link)."""
        user.authentik_sub = authentik_sub
        db.add(user)
        await db.flush()
        await db.refresh(user)
        return user

    async def create_oidc_user(
        self,
        db: AsyncSession,
        *,
        username: str,
        full_name: str,
        role: str,
        authentik_sub: str,
    ) -> User:
        """JIT provision for OIDC (only when AUTH_OIDC_ALLOW_JIT=true)."""
        user = User(
            username=username,
            full_name=full_name,
            role=role,
            authentik_sub=authentik_sub,
            avatar_seed=generate_avatar_seed(),
            is_deleted=False,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        return user

    async def get_by_id(self, db: AsyncSession, user_id: int) -> User | None:
        result = await db.execute(
            select(User).where(User.id == user_id, User.is_deleted == False)
        )
        return result.scalar_one_or_none()
