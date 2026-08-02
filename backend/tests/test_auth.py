import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.auth import login
from app.core.config import settings


pytestmark = pytest.mark.asyncio(loop_scope="module")


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
