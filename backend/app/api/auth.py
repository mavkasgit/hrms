import time
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
import bcrypt
from pydantic import BaseModel
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

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


def _create_token(username: str, role: str, full_name: str) -> str:
    """Создать JWT-токен с hrms_access_level."""
    expire = time.time() + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    payload = {
        "sub": username,
        "username": username,
        "full_name": full_name,
        "hrms_access_level": role,
        "exp": int(expire),
    }
    secret_key = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    return jwt.encode(payload, secret_key, algorithm=settings.ALGORITHM)


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

    token = _create_token(
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
