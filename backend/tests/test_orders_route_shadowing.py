"""Регрессионный тест роутинга /orders/drafts и /orders/settings (#46).

Баг живёт в маршрутизации (тень динамического `/{order_id}` перехватывает
статичные пути), поэтому тест ходит в реальное ASGI-приложение через
ASGITransport, а не в хендлеры напрямую.

Проверяем, что:
- `GET /orders/drafts` -> 200 (не 422, как было до фикса `:int` конвертера);
- `GET /orders/settings` -> 200 (не 422);
- `GET /orders/42` -> 404 с error_code `order_not_found` (числовой id доходит до
  хендлера `/{order_id}`, а не падает в заглушку/другой маршрут);
- `GET /orders/not-a-number` -> 404 (не 422) — `:int` конвертер не over-match.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.services.order_draft_service import order_draft_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest_asyncio.fixture
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


@pytest.fixture
def onlyoffice_enabled():
    """Включаем OnlyOffice, чтобы /orders/drafts не падал с 503 (onlyoffice_disabled)."""
    original = settings.ONLYOFFICE_ENABLED
    settings.ONLYOFFICE_ENABLED = True
    yield
    settings.ONLYOFFICE_ENABLED = original


@pytest.fixture
def drafts_empty(monkeypatch):
    """Мокаем список черновиков, чтобы тест не зависел от папки .drafts на диске."""
    monkeypatch.setattr(order_draft_service, "list_drafts", _no_drafts)


def _no_drafts() -> list[dict[str, Any]]:
    return []


@asynccontextmanager
async def _logged_in_as(username: str):
    async def override():
        return CurrentUser(username, role="admin", full_name="Local Name")

    app.dependency_overrides[get_current_user] = override
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_orders_route_shadowing(
    async_client, db_session, onlyoffice_enabled, drafts_empty
):
    async with _logged_in_as("tester"):
        drafts = await async_client.get("/api/orders/drafts")
        assert drafts.status_code == 200, drafts.text

        order_settings = await async_client.get("/api/orders/settings")
        assert order_settings.status_code == 200, order_settings.text

        by_id = await async_client.get("/api/orders/42")
        assert by_id.status_code == 404, by_id.text
        assert by_id.json().get("error_code") == "order_not_found"

        not_a_number = await async_client.get("/api/orders/not-a-number")
        assert not_a_number.status_code == 404, not_a_number.text
