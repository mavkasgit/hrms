"""
Пользователи: только self-service профиль текущего пользователя.

Админ-IAM удалён (#35): создание/редактирование/удаление/приглашение
пользователей в приложении недоступно (404). Жизненный цикл аккаунта —
только в IdP (Authentik); локальная запись создаётся JIT при первом
OIDC-входе (см. app/services/oidc_auth_service.py и app/api/deps.py).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from typing import Literal

from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.api.deps import get_current_user, CurrentUser


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

router = APIRouter(prefix="/users", tags=["users"])


class AvatarSeedUpdate(BaseModel):
    """Payload для PATCH /users/me/avatar. NULL = сбросить (пустая заглушка на UI)."""
    avatar_seed: str | None = Field(None, max_length=64)


class ProfileUpdate(BaseModel):
    """Единый human-profile (SoT Authentik при наличии sub + API token)."""
    full_name: str | None = Field(None, min_length=1, max_length=255)
    avatar_seed: str | None = Field(None, max_length=64)
    # True → явно сбросить avatar (отличается от «не передавали поле»)
    clear_avatar: bool = False
    email: EmailStr | None = None
    locale: Literal["ru", "en"] | None = None
    theme: Literal["system", "light", "dark"] | None = None


async def _load_me_user(db: AsyncSession, username: str) -> User:
    result = await db.execute(
        select(User).where(User.username == username, User.is_deleted == False)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


@router.patch("/me/avatar")
async def update_my_avatar(
    payload: AvatarSeedUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Установить или сбросить avatar_seed. При SSO — пишет в Authentik attributes."""
    from app.services import unified_profile_service as ups
    from app.services.authentik_admin_service import AuthentikAdminError

    user = await _load_me_user(db, current_user.username)

    if user.authentik_sub and ups.profile_sync_enabled():
        try:
            remote = await ups.push_profile_by_sub(
                user.authentik_sub,
                avatar_seed=payload.avatar_seed,
            )
            user.avatar_seed = remote.avatar_seed
            if remote.full_name:
                user.full_name = remote.full_name
            user.profile_synced_at = _utcnow()
        except AuthentikAdminError as exc:
            code = exc.status_code or 502
            if code == 404:
                code = 404
            raise HTTPException(status_code=code, detail=exc.message) from exc
    else:
        user.avatar_seed = payload.avatar_seed

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"avatar_seed": user.avatar_seed, "full_name": user.full_name}


@router.patch("/me/profile")
async def update_my_profile(
    payload: ProfileUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Обновить display-профиль (имя / email / locale / theme / аватар). SoT = Authentik."""
    from app.services import unified_profile_service as ups
    from app.services.authentik_admin_service import AuthentikAdminError

    user = await _load_me_user(db, current_user.username)

    has_any = (
        payload.full_name is not None
        or payload.clear_avatar
        or payload.avatar_seed is not None
        or payload.email is not None
        or payload.locale is not None
        or payload.theme is not None
    )
    if not has_any:
        return {
            "full_name": user.full_name,
            "avatar_seed": user.avatar_seed,
            "email": None,
            "locale": user.locale,
            "theme": user.theme,
        }

    want_name = payload.full_name.strip() if payload.full_name else None
    want_email = str(payload.email).strip() if payload.email is not None else None
    want_locale = payload.locale
    want_theme = payload.theme
    # avatar: clear_avatar → None; avatar_seed set → value; else leave unchanged on IdP
    avatar_arg: object
    if payload.clear_avatar:
        avatar_arg = None
    elif payload.avatar_seed is not None:
        avatar_arg = payload.avatar_seed
    else:
        avatar_arg = ...

    email_out: str | None = None

    if user.authentik_sub and ups.profile_sync_enabled():
        try:
            remote = await ups.push_profile_by_sub(
                user.authentik_sub,
                full_name=want_name,
                avatar_seed=avatar_arg,
                email=want_email,
                locale=want_locale,
                theme=want_theme,
            )
            if want_name:
                user.full_name = remote.full_name or want_name
            if avatar_arg is not ...:
                user.avatar_seed = remote.avatar_seed
            elif remote.full_name:
                user.full_name = remote.full_name
            if want_locale is not None:
                user.locale = remote.locale or want_locale
            if want_theme is not None:
                user.theme = remote.theme or want_theme
            email_out = remote.email or want_email
            user.profile_synced_at = _utcnow()
        except AuthentikAdminError as exc:
            raise HTTPException(
                status_code=exc.status_code or 502,
                detail=exc.message,
            ) from exc
    else:
        if want_name:
            user.full_name = want_name
        if payload.clear_avatar:
            user.avatar_seed = None
        elif payload.avatar_seed is not None:
            user.avatar_seed = payload.avatar_seed
        if want_locale is not None:
            user.locale = want_locale
        if want_theme is not None:
            user.theme = want_theme
        # email: no local column in HRMS — only via IdP
        email_out = want_email

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {
        "full_name": user.full_name,
        "avatar_seed": user.avatar_seed,
        "email": email_out,
        "locale": user.locale,
        "theme": user.theme,
    }
