import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest.fixture
async def async_client(db_session: AsyncSession):
    """ASGI client bound to the same db_session (savepoint-safe).

    A separate connection from db_session_factory cannot see uncommitted
    outer-transaction data under HRMS_TEST_ISOLATION=savepoint.
    """

    async def override_get_db():
        try:
            yield db_session
        finally:
            # Release nested savepoint so later requests see prior writes.
            await db_session.commit()

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

    # 2. Логин по неверному инвайт-коду должен отдавать 410 (endpoint отключён)
    resp = await async_client.post("/api/auth/invite/login", json={"invite_code": "111111"})
    assert resp.status_code == 410

    # 3. Любой инвайт-код (даже правильный) тоже 410 — endpoint отключён
    resp = await async_client.post("/api/auth/invite/login", json={"invite_code": "987654"})
    assert resp.status_code == 410


async def test_invite_kept_until_password(db_session: AsyncSession, create_employee):
    # Без локального пароля invite_code остаётся (онбординг не завершён)
    employee = await create_employee()
    user = User(
        username="invite_keep_test_user",
        full_name="Инвайт Тест",
        role="viewer",
        password_hash="sso_bypass_hash",
        invite_code="123456",
        is_deleted=False,
        employee_id=employee.id,
    )
    db_session.add(user)
    await db_session.commit()

    from app.core.user_auth import clear_invite_if_fully_activated

    assert clear_invite_if_fully_activated(user) is False
    assert user.invite_code == "123456"

    # После установки пароля invite сбрасывается
    import bcrypt
    from datetime import datetime, timezone

    user.password_hash = bcrypt.hashpw(b"secret", bcrypt.gensalt()).decode("utf-8")
    user.password_changed_at = datetime.now(timezone.utc)

    clear_invite_if_fully_activated(user)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    assert user.invite_code is None
