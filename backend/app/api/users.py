from fastapi import APIRouter, Depends, HTTPException, status
import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.core.database import get_db
from app.models.user import User
from app.models.employee import Employee
from app.schemas.user import UserCreate, UserUpdate, UserOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _current_user: str = Depends(get_current_user),
) -> list[UserOut]:
    """Получить список всех активных пользователей."""
    result = await db.execute(
        select(User)
        .options(joinedload(User.employee))
        .where(User.is_deleted == False)
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
    password_hash = (
        bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        if payload.password
        else "sso_bypass_hash"
    )

    user = User(
        username=payload.username,
        full_name=full_name,
        role=payload.role or "admin",
        employee_id=payload.employee_id,
        password_hash=password_hash,
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
        
    if payload.role:
        user.role = payload.role

    # Обновить пароль для резервного локального входа, если передан
    if payload.password:
        user.password_hash = bcrypt.hashpw(
            payload.password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")
        
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
        
    user.is_deleted = True
    user.deleted_at = func.now()
    # Free telegram/phone identity for re-link after soft-delete (M3).
    user.telegram_id = None
    user.phone = None
    user.phone_verified_at = None
    await db.commit()
