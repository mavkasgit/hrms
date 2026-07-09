from fastapi import APIRouter, Depends, HTTPException, status
import bcrypt
from pydantic import BaseModel
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.api.deps import get_current_user, CurrentUser
from app.services.auth_token import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    full_name: str


def _verify_password(plain: str, hashed: str) -> bool:
    """Проверить пароль. В dev-режиме принимаем пароль 'dev' без хэша."""
    # Dev bypass: если DEV_BYPASS_AUTH включён и пароль "dev" — пропускаем
    if settings.DEV_BYPASS_AUTH and plain == "dev":
        return True
    # Обычная проверка bcrypt
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Запасной вход по логину и паролю (без SSO KTM-2000).

    В dev-режиме (DEV_BYPASS_AUTH=True на бэкенде) принимает пароль "dev"
    для любого существующего пользователя.
    """
    result = await db.execute(
        select(User).where(User.username == payload.username, User.is_deleted == False)
    )
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )

    if not _verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )

    token = create_access_token(
        username=user.username,
        role=user.role,
        full_name=user.full_name or user.username,
    )

    return LoginResponse(
        access_token=token,
        username=user.username,
        role=user.role,
        full_name=user.full_name or user.username,
    )


@router.get("/me")
async def get_me(
    current_user: CurrentUser = Depends(get_current_user),
):
    """Получить информацию о текущем авторизованном пользователе."""
    return {
        "username": current_user.username,
        "role": current_user.role,
        "full_name": current_user.full_name,
    }
