"""Telegram authentication service (Phase 0 skeleton).

OIDC verify / bot webhook live in later phases — not implemented here.
"""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.auth_token import create_access_token


class TelegramAuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository()

    async def resolve_or_provision_user(
        self,
        *,
        telegram_id: int,
        full_name: str,
        preferred_username: str | None,
        phone: str | None,
    ) -> User:
        """
        1. get_by_telegram_id
        2. if phone: get_by_phone (optional match + set telegram_id if unlinked)
        3. if none and TELEGRAM_ALLOW_JIT: create username=preferred if free else tg_<id>
        4. else raise HTTPException 403 detail=telegram_not_allowed
        """
        user = await self.users.get_by_telegram_id(self.db, telegram_id)
        if user is not None:
            if phone and not user.phone:
                user.phone = phone
                self.db.add(user)
                await self.db.flush()
                await self.db.refresh(user)
            return user

        if phone:
            by_phone = await self.users.get_by_phone(self.db, phone)
            if by_phone is not None:
                if by_phone.telegram_id is None:
                    return await self.users.link_telegram(
                        self.db, by_phone, telegram_id, phone=phone
                    )
                if by_phone.telegram_id != telegram_id:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="telegram_already_linked",
                    )
                return by_phone

        if not settings.TELEGRAM_ALLOW_JIT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="telegram_not_allowed",
            )

        username = await self._pick_username(preferred_username, telegram_id)
        role = settings.TELEGRAM_DEFAULT_ROLE or "viewer"
        return await self.users.create_telegram_user(
            self.db,
            telegram_id=telegram_id,
            username=username,
            full_name=full_name or username,
            role=role,
            phone=phone,
        )

    async def _pick_username(
        self, preferred_username: str | None, telegram_id: int
    ) -> str:
        if preferred_username:
            candidate = preferred_username.strip()[:100]
            if candidate:
                existing = await self.users.get_by_username(self.db, candidate)
                if existing is None:
                    return candidate
        return f"tg_{telegram_id}"

    def issue_login_response(self, user: User) -> dict:
        """create_access_token + LoginResponse-compatible dict."""
        full_name = user.full_name or user.username
        token = create_access_token(
            username=user.username,
            role=user.role,
            full_name=full_name,
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": user.username,
            "role": user.role,
            "full_name": full_name,
        }
