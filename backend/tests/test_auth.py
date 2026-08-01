import pytest
import bcrypt
from fastapi import HTTPException
from sqlalchemy.future import select
from starlette.requests import Request

from app.api.auth import login, LoginRequest
from app.api.users import create_user
from app.schemas.user import UserCreate
from app.models.user import User
from app.core.config import settings
from jose import jwt


pytestmark = pytest.mark.asyncio(loop_scope="module")


def _make_request(
    *,
    ip: str = "127.0.0.1",
    user_agent: str = "pytest-agent",
) -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/auth/login",
        "raw_path": b"/api/auth/login",
        "query_string": b"",
        "headers": [(b"user-agent", user_agent.encode("utf-8"))],
        "client": (ip, 12345),
        "server": ("test", 80),
    }
    return Request(scope)


async def test_create_user_hashes_password(db_session, create_employee):
    """Тест: создание пользователя с паролем хеширует пароль в БД."""
    employee = await create_employee()
    await db_session.commit()

    payload = UserCreate(
        username="test_auth_user",
        full_name="Тестовый Пользователь",
        employee_id=employee.id,
        role="admin",
        password="secretpassword123",
    )

    # Создаем пользователя напрямую через функцию роутера
    res = await create_user(payload=payload, db=db_session, _current_user="admin")
    assert res.username == "test_auth_user"

    # Проверяем в БД, что пароль захеширован
    result = await db_session.execute(
        select(User).where(User.username == "test_auth_user")
    )
    user = result.scalars().first()
    assert user is not None
    assert user.password_hash != "secretpassword123"
    assert bcrypt.checkpw("secretpassword123".encode("utf-8"), user.password_hash.encode("utf-8"))


async def test_login_disabled_permanently():
    """Тест: эндпоинт login() отключён насовсем и возвращает 403."""
    with pytest.raises(HTTPException) as exc_info:
        await login()
    assert exc_info.value.status_code == 403
    assert "отключен" in exc_info.value.detail or "disabled" in exc_info.value.detail


async def test_magic_admin_allowed_when_dev_bypass(db_session):
    """Literal Bearer 'admin' works only when DEV_BYPASS_AUTH is true."""
    from app.api.deps import get_current_user

    original_bypass = settings.DEV_BYPASS_AUTH
    settings.DEV_BYPASS_AUTH = True
    try:
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/auth/me",
            "raw_path": b"/api/auth/me",
            "query_string": b"",
            "headers": [(b"authorization", b"Bearer admin")],
            "client": ("127.0.0.1", 12345),
            "server": ("test", 80),
        }
        request = Request(scope)
        user = await get_current_user(request=request, db=db_session)
        assert user.username == "admin"
        assert user.role == "admin"
    finally:
        settings.DEV_BYPASS_AUTH = original_bypass


async def test_magic_admin_rejected_when_strict(db_session):
    """Literal Bearer 'admin' is rejected when DEV_BYPASS_AUTH is false (prod/strict)."""
    from app.api.deps import get_current_user

    original_bypass = settings.DEV_BYPASS_AUTH
    settings.DEV_BYPASS_AUTH = False
    try:
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/auth/me",
            "raw_path": b"/api/auth/me",
            "query_string": b"",
            "headers": [(b"authorization", b"Bearer admin")],
            "client": ("127.0.0.1", 12345),
            "server": ("test", 80),
        }
        request = Request(scope)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request=request, db=db_session)
        assert exc_info.value.status_code == 401
    finally:
        settings.DEV_BYPASS_AUTH = original_bypass
