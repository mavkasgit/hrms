"""Telegram OIDC login tests (Phase 1)."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from jose import jwt as jose_jwt

from app.api.auth import LoginRequest, login
from app.api.telegram_auth import get_telegram_oidc_config, telegram_oidc_login
from app.api.users import create_user
from app.core.config import settings
from app.repositories.user_repository import UserRepository
from app.schemas.telegram_auth import TelegramOidcLoginRequest
from app.schemas.user import UserCreate
from app.services.telegram_auth_service import TelegramAuthService


pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest.fixture
def oidc_client_id():
    original = settings.TELEGRAM_OIDC_CLIENT_ID
    settings.TELEGRAM_OIDC_CLIENT_ID = "test-tg-client-id"
    try:
        yield "test-tg-client-id"
    finally:
        settings.TELEGRAM_OIDC_CLIENT_ID = original


@pytest.fixture
def jit_off():
    original = settings.TELEGRAM_ALLOW_JIT
    settings.TELEGRAM_ALLOW_JIT = False
    try:
        yield
    finally:
        settings.TELEGRAM_ALLOW_JIT = original


@pytest.fixture
def jit_on():
    original = settings.TELEGRAM_ALLOW_JIT
    settings.TELEGRAM_ALLOW_JIT = True
    try:
        yield
    finally:
        settings.TELEGRAM_ALLOW_JIT = original


async def test_oidc_config_disabled_when_no_client_id():
    original = settings.TELEGRAM_OIDC_CLIENT_ID
    settings.TELEGRAM_OIDC_CLIENT_ID = ""
    try:
        cfg = await get_telegram_oidc_config()
        assert cfg.enabled is False
        assert cfg.client_id == ""
        assert cfg.authorize_url == "https://oauth.telegram.org/auth"
        assert "openid" in cfg.scopes
    finally:
        settings.TELEGRAM_OIDC_CLIENT_ID = original


async def test_oidc_config_enabled(oidc_client_id):
    original_bot = settings.TELEGRAM_BOT_USERNAME
    settings.TELEGRAM_BOT_USERNAME = "hrms_bot"
    try:
        cfg = await get_telegram_oidc_config()
        assert cfg.enabled is True
        assert cfg.client_id == oidc_client_id
        assert cfg.bot_username == "hrms_bot"
    finally:
        settings.TELEGRAM_BOT_USERNAME = original_bot


async def test_oidc_not_configured_returns_503(db_session):
    original = settings.TELEGRAM_OIDC_CLIENT_ID
    settings.TELEGRAM_OIDC_CLIENT_ID = ""
    try:
        payload = TelegramOidcLoginRequest(id_token="fake", nonce="n1")
        with pytest.raises(HTTPException) as exc_info:
            await telegram_oidc_login(payload=payload, db=db_session)
        assert exc_info.value.status_code == 503
        assert exc_info.value.detail == "telegram_not_configured"
    finally:
        settings.TELEGRAM_OIDC_CLIENT_ID = original


async def test_oidc_login_valid_mocked(
    db_session, oidc_client_id, jit_on
):
    """valid mocked claims → 200 LoginResponse with access_token claims."""
    claims = {
        "id": 424242,
        "sub": "424242",
        "name": "TG Test User",
        "preferred_username": "tg_test_user",
        "nonce": "nonce-ok",
    }

    with patch.object(
        TelegramAuthService,
        "verify_oidc_id_token",
        new=AsyncMock(return_value=claims),
    ):
        payload = TelegramOidcLoginRequest(id_token="valid.jwt", nonce="nonce-ok")
        response = await telegram_oidc_login(payload=payload, db=db_session)

    assert response.username in ("tg_test_user", "tg_424242")
    assert response.role == settings.TELEGRAM_DEFAULT_ROLE
    assert response.full_name == "TG Test User"
    assert response.access_token
    assert response.token_type == "bearer"

    secret = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    decoded = jose_jwt.decode(
        response.access_token,
        secret,
        algorithms=[settings.ALGORITHM],
        options={"verify_exp": False},
    )
    assert decoded["sub"] == response.username
    assert decoded["username"] == response.username
    assert decoded["full_name"] == "TG Test User"
    assert decoded["hrms_access_level"] == response.role
    assert "exp" in decoded


async def test_oidc_login_existing_telegram_user(
    db_session, oidc_client_id, jit_off
):
    """Pre-linked telegram_id works even when JIT is off."""
    repo = UserRepository()
    user = await repo.create_telegram_user(
        db_session,
        telegram_id=777001,
        username="prelinked_tg",
        full_name="Pre Linked",
        role="viewer",
    )
    await db_session.commit()

    claims = {
        "id": 777001,
        "name": "Pre Linked",
        "nonce": "n-link",
    }
    with patch.object(
        TelegramAuthService,
        "verify_oidc_id_token",
        new=AsyncMock(return_value=claims),
    ):
        response = await telegram_oidc_login(
            payload=TelegramOidcLoginRequest(id_token="t", nonce="n-link"),
            db=db_session,
        )

    assert response.username == user.username
    assert response.access_token


async def test_oidc_bad_signature_401(db_session, oidc_client_id):
    with patch.object(
        TelegramAuthService,
        "verify_oidc_id_token",
        new=AsyncMock(
            side_effect=HTTPException(status_code=401, detail="telegram_invalid_token")
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await telegram_oidc_login(
                payload=TelegramOidcLoginRequest(id_token="bad", nonce="n"),
                db=db_session,
            )
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "telegram_invalid_token"


async def test_oidc_bad_nonce_401(db_session, oidc_client_id):
    with patch.object(
        TelegramAuthService,
        "verify_oidc_id_token",
        new=AsyncMock(
            side_effect=HTTPException(status_code=401, detail="telegram_nonce_mismatch")
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await telegram_oidc_login(
                payload=TelegramOidcLoginRequest(id_token="t", nonce="wrong"),
                db=db_session,
            )
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "telegram_nonce_mismatch"


async def test_oidc_jit_off_unknown_403(db_session, oidc_client_id, jit_off):
    claims = {
        "id": 999888777,
        "name": "Unknown TG",
        "nonce": "n-jit",
    }
    with patch.object(
        TelegramAuthService,
        "verify_oidc_id_token",
        new=AsyncMock(return_value=claims),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await telegram_oidc_login(
                payload=TelegramOidcLoginRequest(id_token="t", nonce="n-jit"),
                db=db_session,
            )
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "telegram_not_allowed"


async def test_verify_oidc_nonce_mismatch_real(db_session, oidc_client_id):
    """Exercise verify_oidc_id_token nonce check with mocked jwt.decode + JWKS."""
    service = TelegramAuthService(db_session)
    fake_claims = {
        "iss": "https://oauth.telegram.org",
        "aud": oidc_client_id,
        "exp": 9999999999,
        "id": 1,
        "nonce": "expected-nonce",
    }
    with (
        patch.object(
            TelegramAuthService,
            "_fetch_jwks",
            new=AsyncMock(return_value={"keys": []}),
        ),
        patch(
            "app.services.telegram_auth_service.jwt.decode",
            return_value=fake_claims,
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await service.verify_oidc_id_token("token", "other-nonce")
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "telegram_nonce_mismatch"


async def test_verify_oidc_expired(db_session, oidc_client_id):
    from jose.exceptions import ExpiredSignatureError

    service = TelegramAuthService(db_session)
    with (
        patch.object(
            TelegramAuthService,
            "_fetch_jwks",
            new=AsyncMock(return_value={"keys": []}),
        ),
        patch(
            "app.services.telegram_auth_service.jwt.decode",
            side_effect=ExpiredSignatureError("expired"),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await service.verify_oidc_id_token("token", "n")
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "telegram_expired"


async def test_password_login_still_works(db_session, create_employee):
    """Regression: password login path unchanged."""
    employee = await create_employee()
    await db_session.commit()

    create_payload = UserCreate(
        username="tg_phase1_pwd_user",
        full_name="Password Still Works",
        employee_id=employee.id,
        role="viewer",
        password="my_secure_password",
    )
    await create_user(payload=create_payload, db=db_session, _current_user="admin")

    response = await login(
        payload=LoginRequest(
            username="tg_phase1_pwd_user",
            password="my_secure_password",
        ),
        db=db_session,
    )
    assert response.username == "tg_phase1_pwd_user"
    assert response.access_token is not None
