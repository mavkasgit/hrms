import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
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


async def test_invite_login_removed(db_session: AsyncSession, async_client: AsyncClient):
    """#35: вход по инвайт-коду удалён — эндпоинт отвечает 404."""
    resp = await async_client.post("/api/auth/invite/login", json={"invite_code": "111111"})
    assert resp.status_code == 404
