"""Telegram bot challenge/webhook/link tests."""

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
    get_telegram_bot_config,
    poll_bot_challenge,
    telegram_webhook,
    telegram_widget_login,
)
from app.api.users import create_user
from app.core.config import settings
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.user_repository import UserRepository
from app.schemas.telegram_auth import (
    TelegramBotChallengeRequest,
    TelegramWidgetLoginRequest,
)
from app.schemas.user import UserCreate
from app.services.telegram_auth_service import TelegramAuthService


pytestmark = pytest.mark.asyncio(loop_scope="module")


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


@pytest.fixture(autouse=True)
def _stub_validate_bot_token():
    """
    Default: bypass the live /getMe pre-flight so unit tests with a fake token
    (123456:ABC-DEF_...) can still create challenges. Tests that want to
    exercise the invalid-token path should re-patch
    ``app.services.telegram_auth_service.TelegramAuthService.validate_bot_token``
    to return ``False`` (or AsyncMock returning a coroutine that resolves to False).
    """
    with patch(
        "app.services.telegram_auth_service.TelegramAuthService.validate_bot_token",
        AsyncMock(return_value=True),
    ):
        yield


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


async def test_bot_config_enabled(bot_configured):
    """/bot/config returns bot_username and bot_enabled when TELEGRAM_BOT_USERNAME is set."""
    cfg = await get_telegram_bot_config()
    assert cfg.bot_username == "hrms_test_bot"
    assert cfg.bot_enabled is True


async def test_bot_config_disabled_when_not_configured():
    """No TELEGRAM_BOT_USERNAME → bot_enabled False (no dev fallback)."""
    orig_user = settings.TELEGRAM_BOT_USERNAME
    settings.TELEGRAM_BOT_USERNAME = ""
    try:
        cfg = await get_telegram_bot_config()
        assert cfg.bot_enabled is False
        assert cfg.bot_username == ""
    finally:
        settings.TELEGRAM_BOT_USERNAME = orig_user


async def test_create_challenge_rejects_when_no_bot_configured(db_session):
    """No bot username + no dev fallback → create_bot_challenge 503."""
    orig_user = settings.TELEGRAM_BOT_USERNAME
    settings.TELEGRAM_BOT_USERNAME = ""
    try:
        service = TelegramAuthService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            await service.create_bot_challenge(purpose="login")
        assert exc_info.value.status_code == 503
        assert exc_info.value.detail == "telegram_not_configured"
    finally:
        settings.TELEGRAM_BOT_USERNAME = orig_user


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


async def test_create_challenge_fails_when_bot_token_invalid(
    db_session, bot_configured
):
    """Pre-flight /getMe returning False must 503 BEFORE creating a challenge.

    Frontend relies on this 503 + ``telegram_bot_token_invalid`` detail to
    surface "check your bot settings" before showing a dead QR.
    """
    service = TelegramAuthService(db_session)
    with patch.object(
        TelegramAuthService,
        "validate_bot_token",
        AsyncMock(return_value=False),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await service.create_bot_challenge(purpose="login")
    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "telegram_bot_token_invalid"


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


async def test_router_webhook_and_poll_helpers(db_session, bot_configured, jit_on):
    """Smoke: call route functions directly."""
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


# ─── T1 hardening: OIDC 501, unlink last factor, rate limit ───────────────


async def test_link_with_id_token_returns_501(db_session, create_employee):
    """OIDC id_token link path is not implemented → 501, never AttributeError."""
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

    with pytest.raises(HTTPException) as exc_info:
        await service.link_to_current_user(
            user, id_token="fake.oidc.token", nonce="n1"
        )
    assert exc_info.value.status_code == 501
    assert exc_info.value.detail == "oidc_link_not_implemented"


async def test_unlink_last_auth_factor_blocked(db_session):
    """User with only sso_bypass_hash cannot unlink Telegram (400)."""
    from app.core.constants import SSO_BYPASS_HASH

    repo = UserRepository()
    user = await repo.create_telegram_user(
        db_session,
        telegram_id=555001,
        username="tg_only_user",
        full_name="TG Only",
        role="viewer",
        telegram_username="tg_only",
    )
    await db_session.commit()
    assert user.password_hash == SSO_BYPASS_HASH
    assert user.telegram_id == 555001

    service = TelegramAuthService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await service.unlink_current_user(user)
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "cannot_unlink_last_auth_factor"
    assert user.telegram_id == 555001


async def test_unlink_with_real_password_ok(db_session, create_employee):
    """User with real password may unlink Telegram (200-equivalent success)."""
    employee = await create_employee()
    await db_session.commit()
    create_payload = UserCreate(
        username="pw_unlink_user",
        full_name="PW Unlink",
        employee_id=employee.id,
        role="viewer",
        password="password123",
        telegram_id=555002,
    )
    await create_user(payload=create_payload, db=db_session, _current_user="admin")
    await db_session.commit()

    service = TelegramAuthService(db_session)
    user = await service.get_user_by_username("pw_unlink_user")
    assert user is not None
    assert user.telegram_id == 555002

    result = await service.unlink_current_user(user)
    assert result["linked"] is False
    assert result["telegram_id"] is None
    assert user.telegram_id is None


async def test_sliding_window_rate_limiter_unit():
    """Pure limiter: allow N, reject N+1 within window."""
    from app.core.rate_limit import SlidingWindowRateLimiter

    limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=60.0)
    t0 = 1000.0
    assert limiter.allow("ip1", now=t0) is True
    assert limiter.allow("ip1", now=t0 + 0.1) is True
    assert limiter.allow("ip1", now=t0 + 0.2) is True
    assert limiter.allow("ip1", now=t0 + 0.3) is False
    # other key independent
    assert limiter.allow("ip2", now=t0 + 0.3) is True
    # after window slides, new request allowed
    assert limiter.allow("ip1", now=t0 + 60.1) is True


async def test_enforce_telegram_public_rate_limit_429():
    """Dependency raises 429 after threshold for same client IP."""
    from unittest.mock import MagicMock

    from app.api import telegram_auth as tg_api

    tg_api._telegram_public_limiter.reset()
    original_max = settings.TELEGRAM_RATE_LIMIT_REQUESTS
    original_window = settings.TELEGRAM_RATE_LIMIT_WINDOW_SECONDS
    settings.TELEGRAM_RATE_LIMIT_REQUESTS = 2
    settings.TELEGRAM_RATE_LIMIT_WINDOW_SECONDS = 60
    try:
        request = MagicMock()
        request.client.host = "203.0.113.10"
        tg_api.enforce_telegram_public_rate_limit(request)
        tg_api.enforce_telegram_public_rate_limit(request)
        with pytest.raises(HTTPException) as exc_info:
            tg_api.enforce_telegram_public_rate_limit(request)
        assert exc_info.value.status_code == 429
        assert exc_info.value.detail == "rate_limit_exceeded"
    finally:
        settings.TELEGRAM_RATE_LIMIT_REQUESTS = original_max
        settings.TELEGRAM_RATE_LIMIT_WINDOW_SECONDS = original_window
        tg_api._telegram_public_limiter.reset()


