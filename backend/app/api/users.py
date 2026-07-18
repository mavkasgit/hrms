from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
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
from app.schemas.user import UserCreate, UserUpdate, UserOut, UserPasswordSetup
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

    # App SoT for roles: payload.role (default viewer). Non-OIDC legacy default remains admin if omitted.
    if settings.AUTH_OIDC_ENABLED:
        role = payload.role or "viewer"
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
        # App SoT: admins may change role even when OIDC is enabled
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
        # Симметрия с setup-password: clear invite только при password + TG
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
    """Сгенерировать одноразовый инвайт-код для пользователя."""
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
    
    import secrets
    
    for _ in range(5):
        invite_code = str(secrets.randbelow(900000) + 100000)
        # Проверяем уникальность
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
    
    return {"invite_code": invite_code}


@router.post("/me/setup-password")
async def setup_my_password(
    payload: UserPasswordSetup,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Ищем пользователя по current_user.username
    result = await db.execute(
        select(User).where(User.username == current_user.username, User.is_deleted == False)
    )
    db_user = result.scalars().first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Хешируем пароль
    password_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db_user.password_hash = password_hash
    db_user.password_changed_at = _utcnow()
    # invite_code сбрасываем только при password + TG (clear_if_fully)
    clear_invite_if_fully_activated(db_user)
    db.add(db_user)
    # R9: revoke other sessions if current sid known, else all.
    if current_user.session_id is not None:
        await session_service.revoke_others(
            db,
            user_id=db_user.id,
            current_session_id=current_user.session_id,
            reason="password_change",
        )
    else:
        await session_service.revoke_all(
            db, user_id=db_user.id, reason="password_change"
        )
    await db.commit()
    return {"status": "ok"}


class AvatarSeedUpdate(BaseModel):
    """Payload для PATCH /users/me/avatar. NULL = сбросить (пустая заглушка на UI)."""
    avatar_seed: str | None = Field(None, max_length=64)


class ProfileUpdate(BaseModel):
    """Единый human-profile (SoT Authentik при наличии sub + API token)."""
    full_name: str | None = Field(None, min_length=1, max_length=255)
    avatar_seed: str | None = Field(None, max_length=64)
    # True → явно сбросить avatar (отличается от «не передавали поле»)
    clear_avatar: bool = False


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
    """Обновить display-профиль (имя / аватар). SoT = Authentik при наличии связи."""
    from app.services import unified_profile_service as ups
    from app.services.authentik_admin_service import AuthentikAdminError

    user = await _load_me_user(db, current_user.username)

    if payload.full_name is None and not payload.clear_avatar and payload.avatar_seed is None:
        # allow avatar_seed=None only with clear_avatar
        if not payload.clear_avatar:
            # empty body: no-op return current
            return {
                "full_name": user.full_name,
                "avatar_seed": user.avatar_seed,
            }

    want_name = payload.full_name.strip() if payload.full_name else None
    # avatar: clear_avatar → None; avatar_seed set → value; else leave unchanged on IdP
    avatar_arg: object
    if payload.clear_avatar:
        avatar_arg = None
    elif payload.avatar_seed is not None:
        avatar_arg = payload.avatar_seed
    else:
        avatar_arg = ...

    if user.authentik_sub and ups.profile_sync_enabled():
        try:
            remote = await ups.push_profile_by_sub(
                user.authentik_sub,
                full_name=want_name,
                avatar_seed=avatar_arg,
            )
            if want_name:
                user.full_name = remote.full_name or want_name
            if avatar_arg is not ...:
                user.avatar_seed = remote.avatar_seed
            elif remote.full_name:
                user.full_name = remote.full_name
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

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"full_name": user.full_name, "avatar_seed": user.avatar_seed}
