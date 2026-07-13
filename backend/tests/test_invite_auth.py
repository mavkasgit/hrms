import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User
from app.repositories.user_repository import UserRepository
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest.fixture(scope="module")
async def async_client(db_session_factory):
    async def override_get_db():
        async with db_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    from app.core.database import get_db
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


async def test_invite_login_flow(db_session: AsyncSession, async_client: AsyncClient, create_employee):
    # 1. Создаем пользователя с инвайт-кодом
    employee = await create_employee()
    user = User(
        username="invite_test_user",
        full_name="Инвайт Тест",
        role="viewer",
        password_hash="sso_bypass_hash",
        invite_code="987654",
        is_deleted=False,
        employee_id=employee.id,
    )
    db_session.add(user)
    await db_session.commit()

    # 2. Логин по неверному инвайт-коду должен отдавать 401
    resp = await async_client.post("/api/auth/invite/login", json={"invite_code": "111111"})
    assert resp.status_code == 401

    # 3. Успешный логин
    resp = await async_client.post("/api/auth/invite/login", json={"invite_code": "987654"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "invite_test_user"
    assert data["access_token"] is not None

    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 4. Проверяем /auth/me
    me_resp = await async_client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["username"] == "invite_test_user"
    assert me_data["has_telegram"] is False
    assert me_data["has_password"] is False
    assert me_data["invite_code"] == "987654"

    # 5. Установка пароля должна сбрасывать invite_code
    setup_resp = await async_client.post(
        "/api/users/me/setup-password",
        json={"password": "new_secure_password"},
        headers=headers,
    )
    assert setup_resp.status_code == 200

    # Проверяем в БД, что invite_code сбросился и пароль изменился
    await db_session.refresh(user)
    assert user.invite_code is None
    assert user.password_hash != "sso_bypass_hash"

    # Проверяем /auth/me теперь
    me_resp = await async_client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["has_password"] is True
    assert me_data["invite_code"] is None


async def test_link_telegram_resets_invite_code(db_session: AsyncSession, create_employee):
    # Тест: UserRepository.link_telegram сбрасывает invite_code в None
    employee = await create_employee()
    user = User(
        username="tg_link_test_user",
        full_name="ТГ Линк Тест",
        role="viewer",
        password_hash="sso_bypass_hash",
        invite_code="123456",
        is_deleted=False,
        employee_id=employee.id,
    )
    db_session.add(user)
    await db_session.commit()

    repo = UserRepository()
    await repo.link_telegram(db_session, user, telegram_id=88888888)
    await db_session.commit()

    assert user.invite_code is None
    assert user.telegram_id == 88888888
