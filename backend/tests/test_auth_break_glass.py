import pytest
import bcrypt
from fastapi import HTTPException
from starlette.requests import Request
from jose import jwt
from sqlalchemy.future import select

from app.api.auth import break_glass_login, get_me, logout, BreakGlassLoginRequest
from app.api.deps import CurrentUser, get_current_user
from app.core.config import settings
from app.models.user_login_event import UserLoginEvent


pytestmark = pytest.mark.asyncio(loop_scope="module")


def _make_request(
    *,
    ip: str = "127.0.0.1",
    user_agent: str = "pytest-agent",
    auth_token: str | None = None,
) -> Request:
    headers = [(b"user-agent", user_agent.encode("utf-8"))]
    if auth_token:
        headers.append((b"authorization", f"Bearer {auth_token}".encode("utf-8")))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/auth/break-glass/login",
        "raw_path": b"/api/auth/break-glass/login",
        "query_string": b"",
        "headers": headers,
        "client": (ip, 12345),
        "server": ("test", 80),
    }
    return Request(scope)


async def test_break_glass_login_disabled(db_session, monkeypatch):
    """Тест: при выключенном BREAK_GLASS_ENABLED возвращает 401."""
    monkeypatch.setattr(settings, "BREAK_GLASS_ENABLED", False)

    payload = BreakGlassLoginRequest(password="secret123")
    request = _make_request()

    with pytest.raises(HTTPException) as exc_info:
        await break_glass_login(payload=payload, request=request)

    assert exc_info.value.status_code == 401
    assert "отключен" in exc_info.value.detail


async def test_break_glass_login_invalid_password(db_session, monkeypatch):
    """Тест: ошибка входа с неверным паролем."""
    hashed = bcrypt.hashpw("valid_password".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    monkeypatch.setattr(settings, "BREAK_GLASS_ENABLED", True)
    monkeypatch.setattr(settings, "BREAK_GLASS_PASSWORD", "")
    monkeypatch.setattr(settings, "BREAK_GLASS_PASSWORD_HASH", hashed)
    monkeypatch.setattr(settings, "BREAK_GLASS_USER", "emergency_admin")

    payload = BreakGlassLoginRequest(password="wrong_password")
    request = _make_request()

    with pytest.raises(HTTPException) as exc_info:
        await break_glass_login(payload=payload, request=request)

    assert exc_info.value.status_code == 401
    assert "Неверный пароль" in exc_info.value.detail


async def test_break_glass_login_success_and_deps(db_session, monkeypatch):
    """Тест: успешный аварийный вход по паролю, проверки токена, /me и логаута."""
    hashed = bcrypt.hashpw("emergency_secret".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    monkeypatch.setattr(settings, "BREAK_GLASS_ENABLED", True)
    monkeypatch.setattr(settings, "BREAK_GLASS_PASSWORD", "")
    monkeypatch.setattr(settings, "BREAK_GLASS_PASSWORD_HASH", hashed)
    monkeypatch.setattr(settings, "BREAK_GLASS_USER", "emergency_admin")

    payload = BreakGlassLoginRequest(password="emergency_secret")
    request = _make_request()

    response = await break_glass_login(payload=payload, request=request)
    assert response.username == "emergency_admin"
    assert response.role == "admin"
    assert response.access_token is not None

    # Проверяем claims токена
    token_claims = jwt.get_unverified_claims(response.access_token)
    assert token_claims.get("is_break_glass") is True
    assert token_claims.get("username") == "emergency_admin"
    assert token_claims.get("role") == "admin"

    # Проверяем get_current_user с токеном аварийного входа
    req_me = _make_request(auth_token=response.access_token)
    current_user = await get_current_user(req_me, db=db_session)
    assert isinstance(current_user, CurrentUser)
    assert current_user.username == "emergency_admin"
    assert current_user.role == "admin"
    assert current_user.is_break_glass is True

    # Проверяем эндпоинт /me
    me_resp = await get_me(current_user=current_user, db=db_session)
    assert me_resp["username"] == "emergency_admin"
    assert me_resp["role"] == "admin"
    assert me_resp["is_break_glass"] is True

    # Проверяем logout
    await logout(request=req_me, db=db_session)

    # Проверяем аудит-события в БД
    events_res = await db_session.execute(
        select(UserLoginEvent).where(UserLoginEvent.username_attempted == "emergency_admin")
    )
    events = events_res.scalars().all()
    assert len(events) >= 1
    sources = [e.details.get("source") for e in events if e.details]
    assert "emergency_access" in sources


async def test_break_glass_login_plain_password(db_session, monkeypatch):
    """Тест: успешный вход по прямому открытому паролю BREAK_GLASS_PASSWORD."""
    monkeypatch.setattr(settings, "BREAK_GLASS_ENABLED", True)
    monkeypatch.setattr(settings, "BREAK_GLASS_PASSWORD", "plain_secret_pass")
    monkeypatch.setattr(settings, "BREAK_GLASS_PASSWORD_HASH", "")

    payload = BreakGlassLoginRequest(password="plain_secret_pass")
    request = _make_request()

    response = await break_glass_login(payload=payload, request=request)
    assert response.username == "emergency_admin"
    assert response.access_token is not None
