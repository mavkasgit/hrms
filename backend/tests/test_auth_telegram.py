"""Telegram OIDC + widget + bot challenge/webhook/link tests."""

import hashlib
import hmac
import time
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
    poll_bot_challenge,
    telegram_oidc_login,
    telegram_webhook,
    telegram_widget_login,
)
from app.api.users import create_user
from app.core.config import settings
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.user_repository import UserRepository
from app.schemas.telegram_auth import (
    TelegramBotChallengeRequest,
    TelegramOidcLoginRequest,
    TelegramWidgetLoginRequest,
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
    orig_token = settings.TELEGRAM_BOT_TOKEN
    orig_poll = settings.TELEGRAM_UPDATES_POLLING
    settings.TELEGRAM_BOT_USERNAME = "hrms_test_bot"
    settings.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret"
    settings.TELEGRAM_BOT_TOKEN = "123456:ABC-DEF_test_bot_token"
    # Unit tests use mock webhook, not live getUpdates.
    settings.TELEGRAM_UPDATES_POLLING = False
    try:
        yield
    finally:
        settings.TELEGRAM_BOT_USERNAME = orig_user
        settings.TELEGRAM_WEBHOOK_SECRET = orig_secret
        settings.TELEGRAM_BOT_TOKEN = orig_token
        settings.TELEGRAM_UPDATES_POLLING = orig_poll


def _sign_widget_payload(bot_token: str, fields: dict) -> dict:
    """Build Telegram Login Widget payload with valid HMAC hash."""
    data = dict(fields)
    pairs = [f"{k}={data[k]}" for k in sorted(data.keys()) if k != "hash"]
    data_check_string = "\n".join(pairs)
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    data["hash"] = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return data


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


# ─── Widget login ─────────────────────────────────────────────────────────


async def test_widget_login_valid_hmac(db_session, bot_configured, jit_on):
    fields = {
        "id": 9001001,
        "first_name": "Widget",
        "last_name": "User",
        "username": "widget_user",
        "auth_date": int(time.time()),
    }
    signed = _sign_widget_payload(settings.TELEGRAM_BOT_TOKEN, fields)
    payload = TelegramWidgetLoginRequest(**signed)
    response = await telegram_widget_login(payload=payload, db=db_session)
    assert response.access_token
    assert response.username in ("widget_user", "tg_9001001")
    assert response.full_name == "Widget User"


async def test_widget_login_bad_hash_401(db_session, bot_configured):
    payload = TelegramWidgetLoginRequest(
        id=1,
        first_name="X",
        auth_date=int(time.time()),
        hash="0" * 64,
    )
    with pytest.raises(HTTPException) as exc_info:
        await telegram_widget_login(payload=payload, db=db_session)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "telegram_invalid_token"


async def test_widget_not_configured_503(db_session):
    original = settings.TELEGRAM_BOT_TOKEN
    settings.TELEGRAM_BOT_TOKEN = ""
    try:
        payload = TelegramWidgetLoginRequest(
            id=1, auth_date=int(time.time()), hash="ab"
        )
        with pytest.raises(HTTPException) as exc_info:
            await telegram_widget_login(payload=payload, db=db_session)
        assert exc_info.value.status_code == 503
    finally:
        settings.TELEGRAM_BOT_TOKEN = original


# ─── No phone auto-link (M2) ──────────────────────────────────────────────


async def test_resolve_does_not_auto_link_by_phone(db_session, jit_off):
    """Phone match without telegram_id must not silent-link (M2)."""
    repo = UserRepository()
    employee_user = await repo.create_telegram_user(
        db_session,
        telegram_id=0,  # will clear after create — use plain user instead
        username="phone_only_user",
        full_name="Phone Only",
        role="viewer",
        phone="+79001234567",
    )
    # create_telegram_user always sets telegram_id; fix to phone-only identity
    employee_user.telegram_id = None
    db_session.add(employee_user)
    await db_session.commit()

    service = TelegramAuthService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await service.resolve_or_provision_user(
            telegram_id=555123,
            full_name="Attacker TG",
            preferred_username=None,
            phone="+79001234567",
        )
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "telegram_not_allowed"

    await db_session.refresh(employee_user)
    assert employee_user.telegram_id is None


# ─── Phase 2: bot challenge / webhook / link ─────────────────────────────


async def test_bot_challenge_not_configured_503(db_session):
    original = settings.TELEGRAM_BOT_USERNAME
    original_bypass = settings.DEV_BYPASS_AUTH
    settings.TELEGRAM_BOT_USERNAME = ""
    settings.DEV_BYPASS_AUTH = False
    try:
        service = TelegramAuthService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            await service.create_bot_challenge(purpose="login")
        assert exc_info.value.status_code == 503
        assert exc_info.value.detail == "telegram_not_configured"
    finally:
        settings.TELEGRAM_BOT_USERNAME = original
        settings.DEV_BYPASS_AUTH = original_bypass


async def test_fake_confirm_only_when_explicitly_enabled(db_session):
    """TELEGRAM_DEV_FAKE_CONFIRM=false: no bot → 503 (no username fake login)."""
    original_user = settings.TELEGRAM_BOT_USERNAME
    original_fake = settings.TELEGRAM_DEV_FAKE_CONFIRM
    original_env = settings.ENV
    settings.TELEGRAM_BOT_USERNAME = ""
    settings.TELEGRAM_DEV_FAKE_CONFIRM = False
    settings.ENV = "development"
    try:
        service = TelegramAuthService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            await service.create_bot_challenge(purpose="login")
        assert exc_info.value.status_code == 503
    finally:
        settings.TELEGRAM_BOT_USERNAME = original_user
        settings.TELEGRAM_DEV_FAKE_CONFIRM = original_fake
        settings.ENV = original_env


async def test_dev_qr_challenge_and_confirm(db_session):
    """Explicit TELEGRAM_DEV_FAKE_CONFIRM: QR without bot → confirm username → JWT."""
    original_user = settings.TELEGRAM_BOT_USERNAME
    original_fake = settings.TELEGRAM_DEV_FAKE_CONFIRM
    original_env = settings.ENV
    settings.TELEGRAM_BOT_USERNAME = ""
    settings.TELEGRAM_DEV_FAKE_CONFIRM = True
    settings.ENV = "development"
    try:
        create_payload = UserCreate(
            username="dev_qr_user",
            full_name="Dev QR User",
            role="admin",
            password="secret",
        )
        await create_user(payload=create_payload, db=db_session, _current_user="admin")

        service = TelegramAuthService(db_session)
        created = await service.create_bot_challenge(purpose="login")
        assert "/api/auth/telegram/bot/dev-confirm" in created["deep_link"]
        assert "token=" in created["deep_link"]
        assert created["poll_secret"] not in created["deep_link"]

        from urllib.parse import parse_qs, urlparse

        qs = parse_qs(urlparse(created["deep_link"]).query)
        token = qs["token"][0]

        confirmed = await service.confirm_dev_challenge(
            token=token, username="dev_qr_user"
        )
        assert confirmed["ok"] is True
        assert confirmed["username"] == "dev_qr_user"

        first = await service.poll_bot_challenge(
            created["challenge_id"], poll_secret=created["poll_secret"]
        )
        assert first["status"] == "confirmed"
        assert first["access_token"]
        assert first["username"] == "dev_qr_user"

        second = await service.poll_bot_challenge(
            created["challenge_id"], poll_secret=created["poll_secret"]
        )
        assert second["status"] == "consumed"
        assert second["access_token"] is None
    finally:
        settings.TELEGRAM_BOT_USERNAME = original_user
        settings.TELEGRAM_DEV_FAKE_CONFIRM = original_fake
        settings.ENV = original_env


async def test_oidc_config_bot_enabled_with_username():
    original_user = settings.TELEGRAM_BOT_USERNAME
    original_client = settings.TELEGRAM_OIDC_CLIENT_ID
    original_fake = settings.TELEGRAM_DEV_FAKE_CONFIRM
    settings.TELEGRAM_BOT_USERNAME = "my_hrms_bot"
    settings.TELEGRAM_OIDC_CLIENT_ID = ""
    settings.TELEGRAM_DEV_FAKE_CONFIRM = False
    try:
        cfg = await get_telegram_oidc_config()
        assert cfg.bot_enabled is True
        assert cfg.dev_qr is False
        assert cfg.bot_username == "my_hrms_bot"
        assert cfg.enabled is False
    finally:
        settings.TELEGRAM_BOT_USERNAME = original_user
        settings.TELEGRAM_OIDC_CLIENT_ID = original_client
        settings.TELEGRAM_DEV_FAKE_CONFIRM = original_fake


async def test_poll_drains_real_telegram_updates(db_session, jit_on):
    """TELEGRAM_UPDATES_POLLING: pending poll pulls getUpdates → real tg id → JWT."""
    original_user = settings.TELEGRAM_BOT_USERNAME
    original_token = settings.TELEGRAM_BOT_TOKEN
    original_poll = settings.TELEGRAM_UPDATES_POLLING
    settings.TELEGRAM_BOT_USERNAME = "hrms_poll_bot"
    settings.TELEGRAM_BOT_TOKEN = "999:TESTTOKEN"
    settings.TELEGRAM_UPDATES_POLLING = True
    # reset module offset between tests
    import app.services.telegram_auth_service as tg_mod

    tg_mod._telegram_updates_offset = None
    tg_mod._telegram_webhook_cleared_for_polling = False

    try:
        service = TelegramAuthService(db_session)
        created = await service.create_bot_challenge(purpose="login")
        start_token = created["deep_link"].split("start=")[1]

        fake_updates = {
            "ok": True,
            "result": [
                {
                    "update_id": 42,
                    "message": {
                        "message_id": 1,
                        "text": f"/start {start_token}",
                        "from": {
                            "id": 777001,
                            "first_name": "Real",
                            "username": "real_tg_user",
                        },
                        "chat": {"id": 777001, "type": "private"},
                    },
                }
            ],
        }

        class _Resp:
            def raise_for_status(self):
                return None

            def json(self):
                return fake_updates

        class _Client:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

            async def get(self, url, params=None):
                assert "getUpdates" in url
                return _Resp()

            async def post(self, url, json=None):
                assert "deleteWebhook" in url
                return _Resp()

        with patch("app.services.telegram_auth_service.httpx.AsyncClient", _Client):
            first = await service.poll_bot_challenge(
                created["challenge_id"], poll_secret=created["poll_secret"]
            )

        assert first["status"] == "confirmed"
        assert first["access_token"]
        assert first["username"]  # JIT created tg_777001
    finally:
        settings.TELEGRAM_BOT_USERNAME = original_user
        settings.TELEGRAM_BOT_TOKEN = original_token
        settings.TELEGRAM_UPDATES_POLLING = original_poll


async def test_bot_challenge_create_and_pending_poll(db_session, bot_configured):
    service = TelegramAuthService(db_session)
    created = await service.create_bot_challenge(purpose="login")
    assert created["challenge_id"]
    assert created["poll_secret"]
    assert created["deep_link"].startswith("https://t.me/hrms_test_bot?start=")
    assert created["poll_secret"] not in created["deep_link"]
    assert created["expires_in"] == settings.TELEGRAM_BOT_CHALLENGE_TTL_SECONDS
    assert created["poll_url"].endswith(created["challenge_id"])

    status = await service.poll_bot_challenge(
        created["challenge_id"], poll_secret=created["poll_secret"]
    )
    assert status["status"] == "pending"
    assert status["access_token"] is None


async def test_poll_without_secret_401(db_session, bot_configured):
    service = TelegramAuthService(db_session)
    created = await service.create_bot_challenge(purpose="login")
    with pytest.raises(HTTPException) as exc_info:
        await service.poll_bot_challenge(created["challenge_id"], poll_secret=None)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "telegram_invalid_poll_secret"


async def test_poll_wrong_secret_401(db_session, bot_configured):
    service = TelegramAuthService(db_session)
    created = await service.create_bot_challenge(purpose="login")
    with pytest.raises(HTTPException) as exc_info:
        await service.poll_bot_challenge(
            created["challenge_id"], poll_secret="wrong-secret-value"
        )
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "telegram_invalid_poll_secret"


async def test_bot_flow_webhook_poll_token_once(db_session, bot_configured, jit_on):
    """challenge → mock webhook /start → poll token once → second poll no token."""
    service = TelegramAuthService(db_session)
    created = await service.create_bot_challenge(purpose="login")
    token = created["deep_link"].split("start=")[1]
    challenge_id = created["challenge_id"]
    poll_secret = created["poll_secret"]

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

    first = await service.poll_bot_challenge(challenge_id, poll_secret=poll_secret)
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

    second = await service.poll_bot_challenge(challenge_id, poll_secret=poll_secret)
    assert second["status"] == "consumed"
    assert second["access_token"] is None


async def test_bot_poll_atomic_second_consume_empty(
    db_session, bot_configured, jit_on
):
    """After first successful poll consume, second poll returns no token (M1)."""
    service = TelegramAuthService(db_session)
    created = await service.create_bot_challenge(purpose="login")
    token = created["deep_link"].split("start=")[1]
    await service.handle_webhook(
        {
            "update_id": 11,
            "message": {
                "text": f"/start {token}",
                "from": {"id": 555002, "first_name": "Race"},
            },
        },
        secret_header=settings.TELEGRAM_WEBHOOK_SECRET,
    )
    first = await service.poll_bot_challenge(
        created["challenge_id"], poll_secret=created["poll_secret"]
    )
    assert first["access_token"]
    # Simulate second concurrent-style call after consume
    second = await service.poll_bot_challenge(
        created["challenge_id"], poll_secret=created["poll_secret"]
    )
    assert second["status"] == "consumed"
    assert second["access_token"] is None

    # try_consume_confirmed on already-consumed returns None
    from uuid import UUID

    claimed = await ChallengeRepository().try_consume_confirmed(
        db_session, UUID(created["challenge_id"])
    )
    assert claimed is None


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
    poll_secret = "expired-poll-secret"
    challenge = await repo.create(
        db_session,
        token="expired-token-xyz",
        purpose="login",
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=10),
        poll_secret_hash=TelegramAuthService.hash_poll_secret(poll_secret),
    )
    await db_session.commit()

    service = TelegramAuthService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await service.poll_bot_challenge(challenge.id, poll_secret=poll_secret)
    assert exc_info.value.status_code == 410
    assert exc_info.value.detail == "challenge_expired"


async def test_bot_challenge_not_found_404(db_session, bot_configured):
    service = TelegramAuthService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await service.poll_bot_challenge(uuid4(), poll_secret="any")
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
        await service.poll_bot_challenge(
            created["challenge_id"], poll_secret=created["poll_secret"]
        )
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
    result = await service.poll_bot_challenge(
        created["challenge_id"], poll_secret=created["poll_secret"]
    )
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
                "from": {"id": 333444, "first_name": "Linkable", "username": "linkable_tg"},
            },
        },
        secret_header=settings.TELEGRAM_WEBHOOK_SECRET,
    )

    linked = await service.link_to_current_user(
        user, challenge_id=ch["challenge_id"]
    )
    assert linked["linked"] is True
    assert linked["telegram_id"] == 333444
    assert user.telegram_username == "linkable_tg"

    unlinked = await service.unlink_current_user(user)
    assert unlinked["linked"] is False
    assert unlinked["telegram_id"] is None
    assert user.telegram_username is None


async def test_link_via_challenge_with_jit_enabled(db_session, bot_configured, jit_on, create_employee):
    """Verify that even with JIT enabled, linking Telegram to an existing user does not provision a new user."""
    employee = await create_employee()
    await db_session.commit()
    create_payload = UserCreate(
        username="link_jit_user",
        full_name="Link JIT User",
        employee_id=employee.id,
        role="viewer",
        password="password123",
    )
    await create_user(payload=create_payload, db=db_session, _current_user="admin")
    await db_session.commit()

    service = TelegramAuthService(db_session)
    user = await service.get_user_by_username("link_jit_user")
    assert user is not None

    ch = await service.create_bot_challenge(purpose="link", user_id=user.id)
    token = ch["deep_link"].split("start=")[1]
    
    # Process /start token from a Telegram ID that doesn't exist yet
    await service.handle_webhook(
        {
            "update_id": 55,
            "message": {
                "text": f"/start {token}",
                "from": {"id": 888999, "first_name": "JIT-proof", "username": "jit_proof_tg"},
            },
        },
        secret_header=settings.TELEGRAM_WEBHOOK_SECRET,
    )

    # Verify that a user named 'jit_proof_tg' or with telegram_id=888999 was NOT created
    repo = UserRepository()
    tg_user = await repo.get_by_telegram_id(db_session, 888999)
    assert tg_user is None, "Should not auto-create a user during a link challenge even if JIT is enabled"

    # Now verify linking is successful
    linked = await service.link_to_current_user(
        user, challenge_id=ch["challenge_id"]
    )
    assert linked["linked"] is True
    assert linked["telegram_id"] == 888999
    assert user.telegram_username == "jit_proof_tg"


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
        poll_secret=created.poll_secret,
        db=db_session,
    )
    assert polled.status == "confirmed"
    assert polled.access_token


async def test_widget_login_replay_prevention(db_session, bot_configured, jit_on):
    """widget signature already used -> 401."""
    fields = {
        "id": 9001002,
        "first_name": "WidgetReplay",
        "last_name": "User",
        "username": "widget_replay_user",
        "auth_date": int(time.time()),
    }
    signed = _sign_widget_payload(settings.TELEGRAM_BOT_TOKEN, fields)
    payload = TelegramWidgetLoginRequest(**signed)

    # First request should succeed
    response = await telegram_widget_login(payload=payload, db=db_session)
    assert response.access_token

    # Second request with the same payload (same HMAC hash) should be rejected
    with pytest.raises(HTTPException) as exc_info:
        await telegram_widget_login(payload=payload, db=db_session)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "telegram_signature_already_used"


async def test_dev_confirm_blocked_in_production(db_session):
    """ENV = 'production' -> dev-confirm returns 404 Not Found."""
    from app.api.telegram_auth import bot_dev_confirm_page, bot_dev_confirm_submit
    from fastapi import Request
    from starlette.datastructures import Headers

    original_env = settings.ENV
    original_fake = settings.TELEGRAM_DEV_FAKE_CONFIRM
    settings.ENV = "production"
    settings.TELEGRAM_DEV_FAKE_CONFIRM = True
    try:
        # GET request to dev-confirm should raise 404
        with pytest.raises(HTTPException) as exc_info_get:
            await bot_dev_confirm_page(token="some-token")
        assert exc_info_get.value.status_code == 404
        assert exc_info_get.value.detail == "not_found"

        # POST request to dev-confirm should raise 404
        scope = {
            "type": "http",
            "headers": Headers({"content-type": "application/json"}).raw,
        }
        mock_request = Request(scope)
        with pytest.raises(HTTPException) as exc_info_post:
            await bot_dev_confirm_submit(request=mock_request, db=db_session)
        assert exc_info_post.value.status_code == 404
        assert exc_info_post.value.detail == "not_found"
    finally:
        settings.ENV = original_env
        settings.TELEGRAM_DEV_FAKE_CONFIRM = original_fake


async def test_jwks_rotation_on_unknown_kid(db_session, oidc_client_id):
    """
    Test JWKS rotation: cache is cleared and refetched when an unknown kid is encountered,
    allowing successful validation if the key is present in the updated JWKS.
    """
    import app.services.telegram_auth_service as tg_mod

    # Reset JWKS module variables
    tg_mod._jwks_cache = (time.time(), {"keys": [{"kid": "old-kid"}]})
    tg_mod._last_jwks_reset_time = 0.0

    service = TelegramAuthService(db_session)

    id_token = "fake.id.token"
    nonce = "expected-nonce"

    fake_claims = {
        "iss": "https://oauth.telegram.org",
        "aud": oidc_client_id,
        "exp": int(time.time()) + 3600,
        "id": 12345,
        "nonce": nonce,
    }

    jwks_old = {"keys": [{"kid": "old-kid"}]}
    jwks_new = {"keys": [{"kid": "new-kid"}]}

    mock_fetch_jwks = AsyncMock(side_effect=[jwks_old, jwks_new])

    with (
        patch("app.services.telegram_auth_service.jwt.get_unverified_header", return_value={"kid": "new-kid"}),
        patch.object(TelegramAuthService, "_fetch_jwks", mock_fetch_jwks),
        patch("app.services.telegram_auth_service.jwt.decode", return_value=fake_claims) as mock_decode,
    ):
        claims = await service.verify_oidc_id_token(id_token, nonce)
        assert claims == fake_claims

        # Verify that _fetch_jwks was called twice (first to get keys, second on retry after clear)
        assert mock_fetch_jwks.call_count == 2
        # Verify cache was cleared
        assert tg_mod._jwks_cache is None
        # Verify jwt.decode was called with updated JWKS
        mock_decode.assert_called_once_with(
            id_token,
            jwks_new,
            algorithms=tg_mod.TELEGRAM_OIDC_ALGORITHMS,
            audience=oidc_client_id,
            issuer=tg_mod.TELEGRAM_OIDC_ISSUER,
            options={
                "verify_aud": True,
                "verify_iss": True,
                "verify_exp": True,
                "require_exp": True,
            },
        )

