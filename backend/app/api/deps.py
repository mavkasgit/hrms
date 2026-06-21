import time
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

class CurrentUser(str):
    def __new__(cls, username: str, role: str | None = None, full_name: str | None = None):
        instance = super().__new__(cls, username)
        instance.username = username
        instance.role = role
        instance.full_name = full_name
        return instance

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> CurrentUser:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication scheme",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    token = auth_header[7:]
    
    # Bypass for testing and dev tools
    if token == "admin":
        result = await db.execute(select(User).where(User.username == "admin", User.is_deleted == False))
        user = result.scalars().first()
        if user:
            return CurrentUser("admin", role=user.role, full_name=user.full_name)
        return CurrentUser("admin", role="admin", full_name="Admin User")
        
    try:
        secret_key = settings.JWT_SECRET_KEY or settings.SECRET_KEY
        payload = jwt.decode(token, secret_key, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check expiration explicitly if not checked by jwt.decode
    exp = payload.get("exp")
    if exp and exp < time.time():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username: str | None = payload.get("username") or payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Check hrms_access_level from token payload
    hrms_access_level = payload.get("hrms_access_level", "no_access")
    if hrms_access_level == "no_access":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ запрещен. У вас нет доступа к кадровой системе."
        )

    expected_role = "admin" if hrms_access_level == "admin" else "viewer"

    # Check if the user exists in the local HRMS database
    result = await db.execute(select(User).where(User.username == username, User.is_deleted == False))
    user = result.scalars().first()
    
    if not user:
        # Just-In-Time provisioning (автоматически создаем запись пользователя в БД HRMS при первом входе SSO)
        jwt_full_name = payload.get("full_name") or username
        
        user = User(
            username=username,
            full_name=jwt_full_name,
            role=expected_role,
            password_hash="sso_bypass_hash",
            is_deleted=False
        )
        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
        except Exception:
            await db.rollback()
            # Попробуем прочитать еще раз на случай состояния гонки (race condition)
            result = await db.execute(select(User).where(User.username == username, User.is_deleted == False))
            user = result.scalars().first()
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Не удалось автоматически зарегистрировать пользователя в кадровой системе",
                )
    else:
        # Синхронизируем роль, если она изменилась в KTM
        if user.role != expected_role:
            user.role = expected_role
            db.add(user)
            try:
                await db.commit()
                await db.refresh(user)
            except Exception:
                await db.rollback()
        
    return CurrentUser(username, role=user.role, full_name=user.full_name)
