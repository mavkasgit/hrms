"""Авто-сид администратора при старте приложения.

Если в системе нет ни одного администратора, создаём дефолтного
(ADMIN_SEED_USERNAME / ADMIN_SEED_FULL_NAME). Это гарантирует, что OIDC-вход
не упирается в 403 oidc_user_not_linked: Authentik-пользователь с таким же
username/email привязывается к сид-админу (resolve_or_provision_user, шаг 2).

Безопасность: созданный пользователь не имеет пароля и authentik_sub —
он неактивен до явной привязки к IdP-аккаунту. Идемпотентен: при наличии
любого админа или занятого username ничего не делает.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.user_auth import generate_avatar_seed
from app.models.user import User
from app.repositories.user_repository import UserRepository


async def ensure_default_admin(db: AsyncSession) -> User | None:
    """Создаёт администратора, если админов нет. Возвращает созданного или None."""
    existing_admin = (
        await db.execute(
            select(User)
            .where(User.role == "admin", User.is_deleted == False)
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing_admin is not None:
        return None

    username = (settings.ADMIN_SEED_USERNAME or "admin").strip()[:100]
    if not username:
        return None
    if await UserRepository().get_by_username(db, username) is not None:
        # username занят не-админом — не повышаем права и не пересоздаём
        return None

    user = User(
        username=username,
        role="admin",
        full_name=(settings.ADMIN_SEED_FULL_NAME or "Администратор").strip()[:255] or "Администратор",
        avatar_seed=generate_avatar_seed(),
        is_active=True,
        is_deleted=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
