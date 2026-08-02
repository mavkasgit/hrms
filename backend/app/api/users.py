from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Literal

from pydantic import BaseModel, EmailStr, Field
import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.core.config import settings
from app.core.constants import SSO_BYPASS_HASH
from app.core.database import get_db
from app.core.user_auth import clear_invite_if_fully_activated, generate_avatar_seed
from app.models.user import User
from app.models.employee import Employee
from app.schemas.user import UserCreate, UserUpdate, UserOut
from app.api.deps import get_current_user, CurrentUser
from app.services import session_service


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

router = APIRouter(prefix="/users", tags=["users"])


async def _ensure_telegram_id_free(
    db: AsyncSession,
    telegram_id: int,
    *,
    exclude_user_id: int | None = None,
) -> None:
    """Reject if telegram_id already linked to another active user."""
    q = select(User).where(User.telegram_id == telegram_id, User.is_deleted == False)
    if exclude_user_id is not None:
        q = q.where(User.id != exclude_user_id)
    existing = await db.execute(q)
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот Telegram ID уже привязан к другому пользователю",
        )


async def _ensure_phone_free(
    db: AsyncSession,
    phone: str,
    *,
    exclude_user_id: int | None = None,
) -> None:
    """Reject if phone already linked to another active user."""
    q = select(User).where(User.phone == phone, User.is_deleted == False)
    if exclude_user_id is not None:
        q = q.where(User.id != exclude_user_id)
    existing = await db.execute(q)
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот телефон уже привязан к другому пользователю",
        )

@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _current_user: str = Depends(get_current_user),
) -> list[UserOut]:
    """Получить список всех активных пользователей."""
    result = await db.execute(
        select(User)
        .options(joinedload(User.employee))
        .where(User.is_deleted == False, User.username != "admin")
        .order_by(User.id)
    )
    users = result.scalars().all()
    
    out_users = []
    for u in users:
        user_out = UserOut.model_validate(u)
        if u.employee:
            user_out.employee_name = u.employee.name
        out_users.append(user_out)
        
    return out_users

@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: str = Depends(get_current_user),
) -> UserOut:
    """Создать нового пользователя."""
    # Проверка уникальности логина
    existing = await db.execute(
        select(User).where(User.username == payload.username, User.is_deleted == False)
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь с таким именем пользователя уже существует",
        )
        
    full_name = payload.full_name
    if payload.employee_id:
        emp = await db.get(Employee, payload.employee_id)
        if not emp:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Сотрудник не найден",
            )
        full_name = emp.name
        
    # Хэшируем пароль, если передан; иначе — только SSO-вход
    has_local_password = bool(payload.password)
    password_hash = (
        bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        if has_local_password
        else SSO_BYPASS_HASH
    )

    telegram_id = payload.telegram_id
    if telegram_id is not None:
        await _ensure_telegram_id_free(db, int(telegram_id))

    phone = (payload.phone or "").strip() or None
    if phone is not None:
        await _ensure_phone_free(db, phone)

    invite_code = payload.invite_code
    if telegram_id is not None:
        invite_code = None

    # App SoT for roles: при OIDC роль назначит IdP при первом входе (fail-closed).
    if settings.AUTH_OIDC_ENABLED:
        role = "viewer"
    else:
        role = payload.role or "admin"

    user = User(
        username=payload.username,
        full_name=full_name,
        role=role,
        employee_id=payload.employee_id,
        password_hash=password_hash,
        password_changed_at=_utcnow() if has_local_password else None,
        telegram_id=telegram_id,
        telegram_username=payload.telegram_username,
        phone=phone,
        invite_code=invite_code,
        avatar_seed=generate_avatar_seed(),
        is_deleted=False
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Подгрузим сотрудника для ответа
    result = await db.execute(
        select(User)
        .options(joinedload(User.employee))
        .where(User.id == user.id)
    )
    user_with_emp = result.scalars().first()
    
    user_out = UserOut.model_validate(user_with_emp)
    if user_with_emp and user_with_emp.employee:
        user_out.employee_name = user_with_emp.employee.name
    return user_out

@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: str = Depends(get_current_user),
) -> UserOut:
    """Обновить существующего пользователя."""
    user = await db.get(User, user_id)
    if not user or user.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )
        
    if payload.username and payload.username != user.username:
        existing = await db.execute(
            select(User).where(User.username == payload.username, User.is_deleted == False)
        )
        if existing.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Пользователь с таким именем пользователя уже существует",
            )
        user.username = payload.username
        
    if payload.employee_id is not None:
        user.employee_id = payload.employee_id
        if payload.employee_id:
            emp = await db.get(Employee, payload.employee_id)
            if not emp:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Сотрудник не найден",
                )
            user.full_name = emp.name
        elif payload.full_name:
            user.full_name = payload.full_name
    elif payload.full_name:
        user.full_name = payload.full_name
        
    if payload.role is not None:
        # Fail-closed: роль управляется IdP при OIDC
        if settings.AUTH_OIDC_ENABLED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="role_managed_by_idp",
            )
        user.role = payload.role

    # Telegram / phone link (field present in JSON, including null → clear)
    fields_set = payload.model_fields_set
    if "telegram_id" in fields_set:
        if payload.telegram_id is None:
            user.telegram_id = None
            user.telegram_username = None
        else:
            tg_id = int(payload.telegram_id)
            if tg_id != user.telegram_id:
                await _ensure_telegram_id_free(db, tg_id, exclude_user_id=user.id)
            user.telegram_id = tg_id
            clear_invite_if_fully_activated(user)

    if "invite_code" in fields_set:
        user.invite_code = payload.invite_code
        # Нельзя выдать инвайт уже полностью активированному аккаунту
        clear_invite_if_fully_activated(user)

    if "telegram_username" in fields_set:
        user.telegram_username = payload.telegram_username

    if "phone" in fields_set:
        if payload.phone is None or not str(payload.phone).strip():
            user.phone = None
            user.phone_verified_at = None
        else:
            phone = str(payload.phone).strip()
            if phone != user.phone:
                await _ensure_phone_free(db, phone, exclude_user_id=user.id)
            user.phone = phone

    # Обновить пароль для резервного локального входа, если передан
    if payload.password:
        user.password_hash = bcrypt.hashpw(
            payload.password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")
        user.password_changed_at = _utcnow()
        # invite_code сбрасываем только при password + TG (clear_if_fully)
        clear_invite_if_fully_activated(user)
        # Admin/other-user password change: revoke all of that user's sessions.
        await session_service.revoke_all(
            db, user_id=user.id, reason="password_change"
        )

    await db.commit()
    
    # Подгрузим сотрудника для ответа
    result = await db.execute(
        select(User)
        .options(joinedload(User.employee))
        .where(User.id == user.id)
    )
    user_with_emp = result.scalars().first()
    
    user_out = UserOut.model_validate(user_with_emp)
    if user_with_emp and user_with_emp.employee:
        user_out.employee_name = user_with_emp.employee.name
    return user_out

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: str = Depends(get_current_user),
) -> None:
    """Мягкое удаление пользователя."""
    user = await db.get(User, user_id)
    if not user or user.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )
        
    if user.username == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить встроенного администратора",
        )
        
    user.is_deleted = True
    user.deleted_at = func.now()
    # Free telegram/phone identity for re-link after soft-delete (M3).
    user.telegram_id = None
    user.phone = None
    user.phone_verified_at = None
    await db.commit()


@router.post("/{user_id}/generate-invite")
async def generate_invite_code(
    user_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Сгенерировать приглашение для пользователя.
    При AUTH_SSO_ONLY=True + Authentik API Token: создаёт пользователя в Authentik
    и возвращает ссылку на enrollment flow.
    Fallback / legacy: 6-значный код.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )
    user = await db.get(User, user_id)
    if not user or user.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )

    from app.services import authentik_admin_service as ak

    # SSO-only mode path: Authentik API user provisioning + enrollment invitation flow
    if settings.AUTH_SSO_ONLY and ak.is_idp_admin_enabled():
        ak_user: dict | None = None
        try:
            ak_user = await ak.get_authentik_user_by_username(user.username)
            if not ak_user:
                role_group = ak.HRMS_ADMIN_GROUP if user.role == "admin" else ak.HRMS_VIEWER_GROUP
                ak_user = await ak.create_authentik_user(
                    username=user.username,
                    name=user.full_name,
                    email=user.username,
                    groups=[role_group],
                )
            if ak_user and "pk" in ak_user and not user.authentik_sub:
                user.authentik_sub = str(ak_user["pk"])
                db.add(user)
                await db.commit()
                await db.refresh(user)
        except ak.AuthentikAdminError as exc:
            raise HTTPException(
                status_code=exc.status_code or 502,
                detail=f"Ошибка создания пользователя в Authentik: {exc.message}",
            ) from exc

        invite_url: str | None = None
        if ak_user and "pk" in ak_user:
            invite_url = await ak.create_authentik_invite_link(int(ak_user["pk"]))

        return {
            "invite_type": "authentik_enrollment",
            "invite_url": invite_url,
            "authentik_linked": bool(user.authentik_sub),
            "invite_code": None,
        }

    # Legacy path (dual-run mode): 6-digit invite code
    import secrets

    for _ in range(5):
        invite_code = str(secrets.randbelow(900000) + 100000)
        existing = await db.execute(
            select(User).where(User.invite_code == invite_code, User.is_deleted == False)
        )
        if not existing.scalars().first():
            break
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сгенерировать уникальный инвайт-код",
        )

    user.invite_code = invite_code
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {
        "invite_type": "local",
        "invite_code": invite_code,
        "invite_url": None,
        "authentik_linked": bool(user.authentik_sub),
    }


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
