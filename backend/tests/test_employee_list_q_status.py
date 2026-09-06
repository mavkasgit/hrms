"""Регресс: поиск по q на /api/employees должен уважать фильтр статуса.

Дисмисс через POST /employees/{id}/dismiss, затем GET /api/employees?status=active&q=<name> —
уволенный сотрудник не должен попадать в выдачу (иначе UI показывает его в активном списке,
ломая e2e/ui/employees-lifecycle.spec.ts «dismiss → restore UI → soft delete»).
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.main import app

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest.fixture
async def async_client(db_session: AsyncSession):
    async def override_get_db():
        try:
            yield db_session
        finally:
            await db_session.commit()

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


async def test_dismissed_employee_not_in_active_search(
    db_session: AsyncSession,
    async_client: AsyncClient,
    create_department,
    create_position,
    create_employee,
):
    employee = await create_employee(name="Уволенный Поиск-Q Тест")
    headers = {"Authorization": "Bearer admin"}

    dismiss_resp = await async_client.post(
        f"/api/employees/{employee.id}/dismiss", headers=headers
    )
    assert dismiss_resp.status_code == 200

    resp = await async_client.get(
        "/api/employees",
        params={"status": "active", "q": "Уволенный Поиск-Q Тест", "per_page": 1000},
        headers=headers,
    )
    assert resp.status_code == 200
    names = [item["name"] for item in resp.json()["items"]]
    assert "Уволенный Поиск-Q Тест" not in names, (
        "Уволенный сотрудник вернулся в поиске со status=active"
    )

    resp = await async_client.get(
        "/api/employees",
        params={"status": "dismissed", "q": "Уволенный Поиск-Q Тест", "per_page": 1000},
        headers=headers,
    )
    assert resp.status_code == 200
    names = [item["name"] for item in resp.json()["items"]]
    assert "Уволенный Поиск-Q Тест" in names, "Уволенный не найден в статусе dismissed"
