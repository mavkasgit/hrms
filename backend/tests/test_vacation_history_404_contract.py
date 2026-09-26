"""HTTP-контракт `GET /api/vacations/employees/{id}/history` для несуществующего сотрудника.

Регрессия: репозиторий возвращал `{"error": "Employee not found"}`, но у эндпоинта
объявлен `response_model=EmployeeVacationHistory` с обязательными employee_id /
employee_name / hire_date / years. Валидация ответа падала, срабатывал глобальный
обработчик, и клиент получал HTTP 500 вместо 404.

Контракт, который защищает тест: на запрос по несуществующему сотруднику фронт
получает 404 и стандартный JSON-конверт ошибки приложения (`error_code` +
человекочитаемый `detail`), а не 500 и не 200 с телом-ошибкой.

Баг жил в связке «репозиторий → response_model → глобальный обработчик», поэтому
тест ходит в реальное ASGI-приложение через ASGITransport, а не зовёт хендлер
напрямую.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.database import get_db
from app.main import app

pytestmark = pytest.mark.asyncio(loop_scope="module")

MISSING_EMPLOYEE_ID = 999_999


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession):
    """Клиент по реальному приложению с подменённой сессией БД и текущим пользователем."""

    async def override_get_db():
        try:
            yield db_session
        finally:
            await db_session.commit()

    async def override_get_current_user():
        return CurrentUser("tester", role="admin", full_name="Test User")

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    # raise_app_exceptions=False повторяет прод-поведение: необработанное исключение
    # уходит в глобальный обработчик, и клиент видит HTTP 500, а не падение теста.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


async def test_history_for_missing_employee_returns_404_error_envelope(
    async_client: AsyncClient,
):
    """Несуществующий сотрудник -> 404 с JSON-конвертом ошибки, а не 500."""
    resp = await async_client.get(
        f"/api/vacations/employees/{MISSING_EMPLOYEE_ID}/history"
    )

    assert resp.status_code == 404, resp.text

    body = resp.json()
    # Клиентский контракт: опечатка/удалённый сотрудник отличается от 500
    # по машиночитаемому error_code, а не по тексту трейсбека.
    assert body.get("error_code") == "employee_not_found", body
    detail = body.get("detail")
    assert isinstance(detail, str) and detail.strip(), body
    # Старый баг отдавал 200 с телом {"error": ...} — такой формы в ответе быть не должно.
    assert "error" not in body, body
