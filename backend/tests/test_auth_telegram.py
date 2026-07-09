"""Telegram OIDC + bot challenge/webhook/link tests (Phase 1–2)."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from jose import jwt as jose_jwt

from app.api.auth import LoginRequest, login
from app.api.telegram_auth import (
    create_bot_challenge,
    get_telegram_oidc_config,
    link_telegram,
    poll_bot_challenge,
    telegram_oidc_login,
    telegram_webhook,
    unlink_telegram,
)
from app.api.users import create_user
from app.core.config import settings
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.user_repository import UserRepository
from app.schemas.telegram_auth import (
    TelegramBotChallengeRequest,
    TelegramLinkRequest,
    TelegramOidcLoginRequest,
)
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


@pytest.fixture
def bot_configured():
    orig_user = settings.TELEGRAM_BOT_USERNAME
    orig_secret = settings.TELEGRAM_WEBHOOK_SECRET
    settings.TELEGRAM_BOT_USERNAME = "hrms_test_bot"
    settings.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret"
    try:
        yield
    finally:
        settings.TELEGRAM_BOT_USERNAME = orig_user
        settings.TELEGRAM_WEBHOOK_SECRET = orig_secret


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


# ─── Phase 2: bot challenge / webhook / link ─────────────────────────────


async def test_bot_challenge_not_configured_503(db_session):
    original = settings.TELEGRAM_BOT_USERNAME
    settings.TELEGRAM_BOT_USERNAME = ""
    try:
        service = TelegramAuthService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            await service.create_bot_challenge(purpose="login")
        assert exc_info.value.status_code == 503
        assert exc_info.value.detail == "telegram_not_configured"
    finally:
        settings.TELEGRAM_BOT_USERNAME = original


async def test_bot_challenge_create_and_pending_poll(db_session, bot_configured):
    service = TelegramAuthService(db_session)
    created = await service.create_bot_challenge(purpose="login")
    assert created["challenge_id"]
    assert created["deep_link"].startswith("https://t.me/hrms_test_bot?start=")
    assert created["expires_in"] == settings.TELEGRAM_BOT_CHALLENGE_TTL_SECONDS
    assert created["poll_url"].endswith(created["challenge_id"])

    status = await service.poll_bot_challenge(created["challenge_id"])
    assert status["status"] == "pending"
    assert status["access_token"] is None


async def test_bot_flow_webhook_poll_token_once(db_session, bot_configured, jit_on):
    """challenge → mock webhook /start → poll token once → second poll no token."""
    service = TelegramAuthService(db_session)
    created = await service.create_bot_challenge(purpose="login")
    token = created["deep_link"].split("start=")[1]
    challenge_id = created["challenge_id"]

    update = {
        "update_id": 1,
        "message": {
            "message_id": 10,
            "text": f"/start {token}",
            "from": {
                "id": 555001,
                "first_name": "Bot",
                "last_name": "User",
                "username": "bot_user_555",
            },
            "chat": {"id": 555001, "type": "private"},
        },
    }
    ok = await service.handle_webhook(
        update, secret_header=settings.TELEGRAM_WEBHOOK_SECRET
    )
    assert ok == {"ok": True}

    first = await service.poll_bot_challenge(challenge_id)
    assert first["status"] == "confirmed"
    assert first["access_token"]
    assert first["username"]
    assert first["token_type"] == "bearer"

    secret = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    decoded = jose_jwt.decode(
        first["access_token"],
        secret,
        algorithms=[settings.ALGORITHM],
        options={"verify_exp": False},
    )
    assert decoded["sub"] == first["username"]
    assert "hrms_access_level" in decoded
    assert "exp" in decoded

    second = await service.poll_bot_challenge(challenge_id)
    assert second["status"] == "consumed"
    assert second["access_token"] is None


async def test_bot_webhook_bad_secret_401(db_session, bot_configured):
    service = TelegramAuthService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await service.handle_webhook(
            {"update_id": 1}, secret_header="wrong-secret"
        )
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "telegram_invalid_token"


async def test_bot_webhook_empty_secret_503(db_session, bot_configured):
    original = settings.TELEGRAM_WEBHOOK_SECRET
    settings.TELEGRAM_WEBHOOK_SECRET = ""
    try:
        service = TelegramAuthService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            await service.handle_webhook({"update_id": 1}, secret_header="x")
        assert exc_info.value.status_code == 503
        assert exc_info.value.detail == "telegram_not_configured"
    finally:
        settings.TELEGRAM_WEBHOOK_SECRET = original


async def test_bot_challenge_expired_410(db_session, bot_configured):
    repo = ChallengeRepository()
    challenge = await repo.create(
        db_session,
        token="expired-token-xyz",
        purpose="login",
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=10),
    )
    await db_session.commit()

    service = TelegramAuthService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await service.poll_bot_challenge(challenge.id)
    assert exc_info.value.status_code == 410
    assert exc_info.value.detail == "challenge_expired"


async def test_bot_challenge_not_found_404(db_session, bot_configured):
    service = TelegramAuthService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await service.poll_bot_challenge(uuid4())
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "challenge_not_found"


async def test_bot_jit_off_unknown_403_on_poll(db_session, bot_configured, jit_off):
    service = TelegramAuthService(db_session)
    created = await service.create_bot_challenge(purpose="login")
    token = created["deep_link"].split("start=")[1]

    await service.handle_webhook(
        {
            "update_id": 2,
            "message": {
                "text": f"/start {token}",
                "from": {"id": 999777666, "first_name": "Unknown"},
            },
        },
        secret_header=settings.TELEGRAM_WEBHOOK_SECRET,
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.poll_bot_challenge(created["challenge_id"])
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "telegram_not_allowed"


async def test_bot_prelinked_user_jit_off(db_session, bot_configured, jit_off):
    repo = UserRepository()
    user = await repo.create_telegram_user(
        db_session,
        telegram_id=888002,
        username="prelinked_bot",
        full_name="Pre Bot",
        role="viewer",
    )
    await db_session.commit()

    service = TelegramAuthService(db_session)
    created = await service.create_bot_challenge(purpose="login")
    token = created["deep_link"].split("start=")[1]
    await service.handle_webhook(
        {
            "update_id": 3,
            "message": {
                "text": f"/start {token}",
                "from": {"id": 888002, "first_name": "Pre"},
            },
        },
        secret_header=settings.TELEGRAM_WEBHOOK_SECRET,
    )
    result = await service.poll_bot_challenge(created["challenge_id"])
    assert result["status"] == "confirmed"
    assert result["username"] == user.username
    assert result["access_token"]


async def test_link_conflict_409(db_session, bot_configured, create_employee):
    """telegram_id already on another user → 409."""
    repo = UserRepository()
    await repo.create_telegram_user(
        db_session,
        telegram_id=111222,
        username="owner_of_tg",
        full_name="Owner",
        role="viewer",
    )
    employee = await create_employee()
    await db_session.commit()

    create_payload = UserCreate(
        username="wants_same_tg",
        full_name="Wants Same",
        employee_id=employee.id,
        role="viewer",
        password="password123",
    )
    await create_user(payload=create_payload, db=db_session, _current_user="admin")
    await db_session.commit()

    service = TelegramAuthService(db_session)
    target = await service.get_user_by_username("wants_same_tg")
    assert target is not None

    # confirmed link challenge with conflicting telegram_id
    ch = await service.create_bot_challenge(purpose="link", user_id=target.id)
    token = ch["deep_link"].split("start=")[1]
    await service.handle_webhook(
        {
            "update_id": 4,
            "message": {
                "text": f"/start {token}",
                "from": {"id": 111222, "first_name": "Conflict"},
            },
        },
        secret_header=settings.TELEGRAM_WEBHOOK_SECRET,
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.link_to_current_user(
            target, challenge_id=ch["challenge_id"]
        )
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "telegram_already_linked"


async def test_link_and_unlink_via_challenge(db_session, bot_configured, create_employee):
    employee = await create_employee()
    await db_session.commit()
    create_payload = UserCreate(
        username="link_unlink_user",
        full_name="Link Unlink",
        employee_id=employee.id,
        role="viewer",
        password="password123",
    )
    await create_user(payload=create_payload, db=db_session, _current_user="admin")
    await db_session.commit()

    service = TelegramAuthService(db_session)
    user = await service.get_user_by_username("link_unlink_user")
    assert user is not None
    assert user.telegram_id is None

    ch = await service.create_bot_challenge(purpose="link", user_id=user.id)
    token = ch["deep_link"].split("start=")[1]
    await service.handle_webhook(
        {
            "update_id": 5,
            "message": {
                "text": f"/start {token}",
                "from": {"id": 333444, "first_name": "Linkable"},
            },
        },
        secret_header=settings.TELEGRAM_WEBHOOK_SECRET,
    )

    linked = await service.link_to_current_user(
        user, challenge_id=ch["challenge_id"]
    )
    assert linked["linked"] is True
    assert linked["telegram_id"] == 333444

    unlinked = await service.unlink_current_user(user)
    assert unlinked["linked"] is False
    assert unlinked["telegram_id"] is None


async def test_link_via_oidc_id_token(db_session, oidc_client_id, create_employee):
    employee = await create_employee()
    await db_session.commit()
    create_payload = UserCreate(
        username="oidc_link_user",
        full_name="OIDC Link",
        employee_id=employee.id,
        role="viewer",
        password="password123",
    )
    await create_user(payload=create_payload, db=db_session, _current_user="admin")
    await db_session.commit()

    service = TelegramAuthService(db_session)
    user = await service.get_user_by_username("oidc_link_user")
    assert user is not None

    claims = {
        "id": 666777,
        "name": "OIDC Linked",
        "nonce": "link-nonce",
    }
    with patch.object(
        TelegramAuthService,
        "verify_oidc_id_token",
        new=AsyncMock(return_value=claims),
    ):
        result = await service.link_to_current_user(
            user, id_token="fake.jwt", nonce="link-nonce"
        )
    assert result["linked"] is True
    assert result["telegram_id"] == 666777


async def test_router_webhook_and_poll_helpers(db_session, bot_configured, jit_on):
    """Smoke: call route functions directly like Phase 1 OIDC tests."""
    from uuid import UUID

    created = await create_bot_challenge(
        request=None,  # type: ignore[arg-type]
        payload=TelegramBotChallengeRequest(purpose="login"),
        db=db_session,
    )

    token = created.deep_link.split("start=")[1]
    resp = await telegram_webhook(
        update={
            "update_id": 99,
            "message": {
                "text": f"/start {token}",
                "from": {"id": 424200, "first_name": "Route"},
            },
        },
        db=db_session,
        x_telegram_bot_api_secret_token=settings.TELEGRAM_WEBHOOK_SECRET,
    )
    assert resp["ok"] is True

    polled = await poll_bot_challenge(
        challenge_id=UUID(created.challenge_id),
        db=db_session,
    )
    assert polled.status == "confirmed"
    assert polled.access_token
