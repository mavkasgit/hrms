"""Профиль текущего пользователя — host-адаптер поверх unified_profile_service.

Поля display-профиля (full_name/email/avatar_seed/locale/theme): SoT = Authentik,
локальная БД — кэш. Канон user-settings 2.0.0: ФИО/email read-only (403 при
попытке изменить), аватар — через отдельный PATCH /auth/me/avatar.

Доменные ошибки — через ``HRMSException``/``NotFoundError`` (глобальный хендлер);
роутер их не ловит.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import HRMSException, NotFoundError
from app.models.user import User
from app.schemas.auth import ProfileUpdate
from app.services import unified_profile_service as ups
from app.services.authentik_client import AuthentikAdminError


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _load_me_user(db: AsyncSession, username: str) -> User:
    result = await db.execute(
        select(User).where(User.username == username, User.is_deleted == False)
    )
    user = result.scalars().first()
    if not user:
        raise NotFoundError("Пользователь не найден")
    return user


async def get_me(
    db: AsyncSession,
    *,
    username: str,
    full_name: str | None = None,
    is_break_glass: bool = False,
    refresh: bool = False,
) -> dict:
    """GET /auth/me — унифицированный профиль (IdP pull best-effort)."""
    if is_break_glass:
        return {
            "username": username,
            "role": "admin",
            "full_name": full_name or "Emergency Access Admin",
            "email": None,
            "locale": "ru",
            "theme": "light",
            "avatar_seed": "emergency",
            "authentik_linked": False,
            "profile_sot": "local",
            "is_break_glass": True,
        }

    user = await _load_me_user(db, username)

    # Unified profile pull (best-effort; local remains if IdP unreachable).
    # email: no DB column on HRMS; ensure_profile_fresh не отдаёт snapshot —
    # клиент читает email опционально (канон user-settings).
    await ups.ensure_profile_fresh(db, user, refresh=refresh)

    return {
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
        "email": None,
        "locale": user.locale,
        "theme": user.theme,
        "avatar_seed": user.avatar_seed,
        "authentik_linked": bool(user.authentik_sub),
        "profile_sot": (
            "authentik"
            if (user.authentik_sub and ups.profile_sync_enabled())
            else "local"
        ),
    }


async def update_my_avatar(
    db: AsyncSession,
    *,
    username: str,
    avatar_seed: str | None,
) -> dict:
    """Установить или сбросить avatar_seed. При SSO — пишет в Authentik attributes."""
    user = await _load_me_user(db, username)

    if user.authentik_sub and ups.profile_sync_enabled():
        try:
            remote = await ups.push_profile_by_sub(
                user.authentik_sub,
                avatar_seed=avatar_seed,
            )
            user.avatar_seed = remote.avatar_seed
            if remote.full_name:
                user.full_name = remote.full_name
            user.profile_synced_at = _utcnow()
        except AuthentikAdminError as exc:
            raise HRMSException(
                exc.message,
                error_code="authentik_profile_error",
                status_code=exc.status_code or 502,
            ) from exc
    else:
        user.avatar_seed = avatar_seed

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"avatar_seed": user.avatar_seed, "full_name": user.full_name}


async def update_my_profile(
    db: AsyncSession,
    *,
    username: str,
    payload: ProfileUpdate,
) -> dict:
    """Обновить display-профиль (locale / theme). SoT = Authentik.

    ФИО и email — read-only для пользователя (канон user-settings 2.0.0):
    они задаются администратором IdP, приложение только читает и кэширует.
    Попытка изменить → 403. Аватар редактируется через отдельный
    ``PATCH /auth/me/avatar``.
    """
    user = await _load_me_user(db, username)

    if payload.full_name is not None or payload.email is not None:
        raise HRMSException(
            "Изменение ФИО/email недоступно, обратитесь к администратору",
            error_code="read_only_field",
            status_code=403,
        )

    has_any = payload.locale is not None or payload.theme is not None
    if not has_any:
        return {
            "full_name": user.full_name,
            "avatar_seed": user.avatar_seed,
            "email": None,
            "locale": user.locale,
            "theme": user.theme,
        }

    want_locale = payload.locale
    want_theme = payload.theme

    email_out: str | None = None

    if user.authentik_sub and ups.profile_sync_enabled():
        try:
            remote = await ups.push_profile_by_sub(
                user.authentik_sub,
                locale=want_locale,
                theme=want_theme,
            )
            if remote.full_name:
                user.full_name = remote.full_name
            if want_locale is not None:
                user.locale = remote.locale or want_locale
            if want_theme is not None:
                user.theme = remote.theme or want_theme
            email_out = remote.email
            user.profile_synced_at = _utcnow()
        except AuthentikAdminError as exc:
            raise HRMSException(
                exc.message,
                error_code="authentik_profile_error",
                status_code=exc.status_code or 502,
            ) from exc
    else:
        if want_locale is not None:
            user.locale = want_locale
        if want_theme is not None:
            user.theme = want_theme
        # email: no local column in HRMS — only via IdP

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
