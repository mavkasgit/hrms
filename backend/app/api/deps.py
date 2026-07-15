import time
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.constants import SSO_BYPASS_HASH
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

    # Сначала активный пользователь. Soft-deleted + новый с тем же username
    # (как shisha_m id=3 deleted / id=4 active) — старый код брал .first() по username
    # без фильтра и блокировал вход «Пользователь удален».
    result = await db.execute(
        select(User).where(User.username == username, User.is_deleted == False)
    )
    user = result.scalars().first()

    if not user:
        deleted = await db.execute(
            select(User).where(User.username == username, User.is_deleted == True)
        )
        if deleted.scalars().first() is not None:
            # Нет активного, но есть удалённый — и только тогда soft-delete lockout.
            # Если есть и deleted, и active, сюда не попадём (active уже найден выше).
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Пользователь удален из системы",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Just-In-Time provisioning (SSO: первый вход без локальной записи)
        jwt_full_name = payload.get("full_name") or username

        user = User(
            username=username,
            full_name=jwt_full_name,
            role=expected_role,
            password_hash=SSO_BYPASS_HASH,
            is_deleted=False,
        )
        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
        except Exception:
            await db.rollback()
            result = await db.execute(
                select(User).where(User.username == username, User.is_deleted == False)
            )
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


async def get_current_user_or_onlyoffice(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> CurrentUser | str:
    auth_header = request.headers.get("Authorization")
    
    # 1. Проверяем, является ли это токеном OnlyOffice из заголовка Authorization
    if settings.ONLYOFFICE_ENABLED and auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            jwt.decode(token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"])
            return "onlyoffice_server"
        except JWTError:
            pass

    # 2. Проверяем OnlyOffice-токен из тела запроса (для Callback)
    if settings.ONLYOFFICE_ENABLED and request.method == "POST":
        try:
            body = await request.json()
            token = body.get("token")
            if token:
                jwt.decode(str(token), settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"])
                return "onlyoffice_server"
        except Exception:
            pass

    # 3. Поддержка передачи токена пользователя через query-параметр "token" (например, при печати в PDF)
    query_token = request.query_params.get("token")
    if not auth_header and query_token:
        class _RequestWithAuthHeader:
            def __init__(self, req: Request, auth_h: str):
                self.req = req
                self.headers = {
                    "Authorization": auth_h,
                    "authorization": auth_h
                }

            def __getattr__(self, name):
                return getattr(self.req, name)

        wrapped_request = _RequestWithAuthHeader(request, f"Bearer {query_token}")
        return await get_current_user(wrapped_request, db)

    # 4. Иначе проверяем как стандартный токен пользователя
    return await get_current_user(request, db)

