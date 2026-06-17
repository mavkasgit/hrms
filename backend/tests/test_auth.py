import pytest
import bcrypt
from fastapi import HTTPException
from sqlalchemy.future import select

from app.api.auth import login, LoginRequest
from app.api.users import create_user
from app.schemas.user import UserCreate
from app.models.user import User
from app.core.config import settings


pytestmark = pytest.mark.asyncio(loop_scope="module")


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


async def test_login_success_with_password(db_session, create_employee):
    """Тест: успешный логин с правильным паролем."""
    employee = await create_employee()
    await db_session.commit()

    # Сначала создаем пользователя с паролем
    create_payload = UserCreate(
        username="login_user",
        full_name="Логин Пользователь",
        employee_id=employee.id,
        role="viewer",
        password="my_secure_password",
    )
    await create_user(payload=create_payload, db=db_session, _current_user="admin")

    # Пытаемся войти
    login_payload = LoginRequest(
        username="login_user",
        password="my_secure_password",
    )
    response = await login(payload=login_payload, db=db_session)
    assert response.username == "login_user"
    assert response.role == "viewer"
    assert response.access_token is not None


async def test_login_failure_with_wrong_password(db_session, create_employee):
    """Тест: ошибка логина с неверным паролем."""
    employee = await create_employee()
    await db_session.commit()

    # Создаем пользователя
    create_payload = UserCreate(
        username="wrong_pass_user",
        full_name="Неверный Пароль Пользователь",
        employee_id=employee.id,
        role="admin",
        password="correctpassword",
    )
    await create_user(payload=create_payload, db=db_session, _current_user="admin")

    # Пытаемся войти с неверным паролем
    login_payload = LoginRequest(
        username="wrong_pass_user",
        password="incorrectpassword",
    )
    with pytest.raises(HTTPException) as exc_info:
        await login(payload=login_payload, db=db_session)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Неверный логин или пароль"


async def test_login_dev_bypass(db_session, create_employee):
    """Тест: dev bypass с паролем 'dev', когда DEV_BYPASS_AUTH=True."""
    original_bypass = settings.DEV_BYPASS_AUTH
    settings.DEV_BYPASS_AUTH = True

    try:
        employee = await create_employee()
        await db_session.commit()

        # Создаем пользователя с паролем
        create_payload = UserCreate(
            username="dev_bypass_user",
            full_name="Dev Bypass Пользователь",
            employee_id=employee.id,
            role="admin",
            password="some_long_password",
        )
        await create_user(payload=create_payload, db=db_session, _current_user="admin")

        # Логинимся с паролем 'dev'
        login_payload = LoginRequest(
            username="dev_bypass_user",
            password="dev",
        )
        response = await login(payload=login_payload, db=db_session)
        assert response.username == "dev_bypass_user"
        assert response.access_token is not None
    finally:
        settings.DEV_BYPASS_AUTH = original_bypass
