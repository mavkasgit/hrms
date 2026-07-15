"""Admin-only API для чтения и обновления системных настроек.

GET  /api/admin/settings        — список всех записей (value маскируется для секретов).
PUT  /api/admin/settings        — частичное обновление (key → new_value). null/"" → очистить.

Доступ — только админы. PUT дополнительно защищён middleware main.check_write_access_middleware,
здесь — defense-in-depth через current_user.role.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from app.api.deps import CurrentUser, get_current_user
from app.core.database import get_db
from app.models.user import User
from app.repositories.system_setting_repository import SystemSettingRepository

router = APIRouter(prefix="/admin/settings", tags=["admin-settings"])


# Ключи, значения которых маскируются на чтении (последние 4 символа видны).
SENSITIVE_KEYS: frozenset[str] = frozenset({"telegram.bot_token"})

# Известные ключи с человекочитаемым описанием. Неизвестные ключи принимаются,
# но без описания — это расширяемая точка для будущих настроек.
KNOWN_KEYS: dict[str, str] = {
    "telegram.bot_token": (
        "Токен Telegram-бота (Bot API). Используется для Login Widget, "
        "QR-логина, вебхуков и отправки сообщений. Пустая строка → fallback на .env."
    ),
}


class SystemSettingItem(BaseModel):
    key: str
    value: Optional[str] = None
    has_value: bool
    description: Optional[str] = None
    updated_at: datetime
    # login (username), как записан в БД — стабильный идентификатор
    updated_by: Optional[str] = None
    # ФИО для UI; null если пользователь не найден
    updated_by_full_name: Optional[str] = None


class SystemSettingsResponse(BaseModel):
    settings: list[SystemSettingItem]


class SystemSettingsUpdate(BaseModel):
    settings: dict[str, Optional[str]] = Field(
        ...,
        description="Ключ → новое значение. null или пустая строка — очистить ключ.",
    )


class SystemSettingsUpdateResponse(BaseModel):
    updated: list[str]


def _require_admin(current_user: CurrentUser) -> None:
    if (current_user.role or "").lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав: требуется роль admin",
        )


def _mask_value(key: str, value: Optional[str]) -> tuple[Optional[str], bool]:
    """Вернуть (value_for_response, has_value). Для секретов — оставить хвост."""
    if value is None or value == "":
        return (None, False)
    if key in SENSITIVE_KEYS:
        if len(value) <= 4:
            return ("*" * len(value), True)
        return ("*" * (len(value) - 4) + value[-4:], True)
    return (value, True)


async def _full_names_by_usernames(
    db: AsyncSession, usernames: set[str]
) -> dict[str, str]:
    """username → full_name (только непустые)."""
    cleaned = {u.strip() for u in usernames if u and u.strip()}
    if not cleaned:
        return {}
    result = await db.execute(
        select(User.username, User.full_name).where(
            User.username.in_(cleaned),
            User.is_deleted == False,  # noqa: E712
        )
    )
    out: dict[str, str] = {}
    for username, full_name in result.all():
        name = (full_name or "").strip()
        if name:
            out[username] = name
    return out


@router.get("", response_model=SystemSettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> SystemSettingsResponse:
    _require_admin(current_user)
    repo = SystemSettingRepository()
    rows = await repo.get_all(db)
    names = await _full_names_by_usernames(
        db, {r.updated_by for r in rows if r.updated_by}
    )
    items: list[SystemSettingItem] = []
    for row in rows:
        masked, has_value = _mask_value(row.key, row.value)
        login = row.updated_by
        items.append(
            SystemSettingItem(
                key=row.key,
                value=masked,
                has_value=has_value,
                description=row.description or KNOWN_KEYS.get(row.key),
                updated_at=row.updated_at,
                updated_by=login,
                updated_by_full_name=names.get(login) if login else None,
            )
        )
    return SystemSettingsResponse(settings=items)


@router.put("", response_model=SystemSettingsUpdateResponse)
async def update_settings(
    payload: SystemSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> SystemSettingsUpdateResponse:
    _require_admin(current_user)
    repo = SystemSettingRepository()
    updated: list[str] = []
    for raw_key, raw_value in payload.settings.items():
        key = (raw_key or "").strip()
        if not key:
            continue
        if len(key) > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Ключ '{key[:30]}…' длиннее 100 символов",
            )

        # None или пустая строка → очищаем ключ.
        if raw_value is None or not str(raw_value).strip():
            await repo.delete(db, key)
        else:
            value = str(raw_value)
            if key in SENSITIVE_KEYS and len(value) < 5:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Значение «{key}» слишком короткое (минимум 5 символов)",
                )
            await repo.upsert(
                db,
                key,
                value,
                updated_by=current_user.username,
            )
        updated.append(key)
    await db.commit()
    return SystemSettingsUpdateResponse(updated=updated)
