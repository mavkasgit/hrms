"""OIDC / Authentik bridge tests — mocked token endpoint + JWKS (no live IdP)."""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from jose import jwt as jose_jwt
from jose.utils import base64url_encode
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.api.auth import LoginResponse, oidc_callback, oidc_config, oidc_logout_url
from app.core.config import settings
from app.core.constants import SSO_BYPASS_HASH
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.oidc_auth import OidcCallbackRequest
from app.services.oidc_auth_service import OidcAuthService


pytestmark = pytest.mark.asyncio(loop_scope="module")

ISSUER = "http://localhost:9000/application/o/hrms/"
CLIENT_ID = "hrms"
REDIRECT_URI = "http://localhost:5173/auth/callback"
KID = "test-key-1"


# ─── RSA / JWT helpers ────────────────────────────────────────────────────────


def _generate_rsa_pair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    numbers = public_key.public_numbers()

    def _b64int(val: int) -> str:
        raw = val.to_bytes((val.bit_length() + 7) // 8 or 1, "big")
        return base64url_encode(raw).decode("ascii")

    jwk = {
        "kty": "RSA",
        "kid": KID,
        "use": "sig",
        "alg": "RS256",
        "n": _b64int(numbers.n),
        "e": _b64int(numbers.e),
    }
    return private_pem, {"keys": [jwk]}


_PRIVATE_PEM, _JWKS = _generate_rsa_pair()


def _make_id_token(
    *,
    sub: str = "ak-sub-uuid-001",
    preferred_username: str = "oidc_user",
    email: str | None = "oidc_user@example.com",
    name: str = "OIDC Test User",
    hrms_access_level: str | None = "viewer",
    aud: str = CLIENT_ID,
    iss: str = ISSUER.rstrip("/"),
    exp_delta: int = 3600,
    extra: dict | None = None,
) -> str:
    now = int(time.time())
    claims: dict = {
        "sub": sub,
        "preferred_username": preferred_username,
        "name": name,
        "aud": aud,
        "iss": iss,
        "iat": now,
        "exp": now + exp_delta,
    }
    if email is not None:
        claims["email"] = email
    if hrms_access_level is not None:
        claims["hrms_access_level"] = hrms_access_level
    if extra:
        claims.update(extra)
    return jose_jwt.encode(
        claims,
        _PRIVATE_PEM,
        algorithm="RS256",
        headers={"kid": KID},
    )


def _make_request(
    *,
    path: str = "/api/auth/oidc/callback",
    ip: str = "127.0.0.1",
    user_agent: str = "pytest-oidc",
) -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [(b"user-agent", user_agent.encode("utf-8"))],
        "client": (ip, 12345),
        "server": ("test", 80),
    }
    return Request(scope)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | str):
        self.status_code = status_code
        self._payload = payload
        self.text = payload if isinstance(payload, str) else json.dumps(payload)

    def json(self):
        if isinstance(self._payload, str):
            return json.loads(self._payload)
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx

            raise httpx.HTTPStatusError(
                "error",
                request=MagicMock(),
                response=MagicMock(status_code=self.status_code),
            )


class _FakeAsyncClient:
    """httpx.AsyncClient stand-in: token POST + JWKS GET."""

    def __init__(self, *, token_body: dict | None = None, token_status: int = 200, jwks=None):
        self.token_body = token_body
        self.token_status = token_status
        self.jwks = jwks if jwks is not None else _JWKS
        self.posts: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, data=None, headers=None, **kwargs):
        self.posts.append({"url": url, "data": data})
        if self.token_body is None:
            return _FakeResponse(self.token_status, {"error": "invalid_grant"})
        return _FakeResponse(self.token_status, self.token_body)

    async def get(self, url, headers=None, **kwargs):
        return _FakeResponse(200, self.jwks)


# ─── fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def oidc_enabled():
    originals = {
        "AUTH_OIDC_ENABLED": settings.AUTH_OIDC_ENABLED,
        "AUTH_OIDC_ISSUER": settings.AUTH_OIDC_ISSUER,
        "AUTH_OIDC_CLIENT_ID": settings.AUTH_OIDC_CLIENT_ID,
        "AUTH_OIDC_CLIENT_SECRET": settings.AUTH_OIDC_CLIENT_SECRET,
        "AUTH_OIDC_REDIRECT_URI": settings.AUTH_OIDC_REDIRECT_URI,
        "AUTH_OIDC_SCOPES": settings.AUTH_OIDC_SCOPES,
        "AUTH_OIDC_JWKS_URL": settings.AUTH_OIDC_JWKS_URL,
        "AUTH_OIDC_TOKEN_URL": settings.AUTH_OIDC_TOKEN_URL,
        "AUTH_OIDC_ALLOW_JIT": settings.AUTH_OIDC_ALLOW_JIT,
        "AUTH_OIDC_DEFAULT_ROLE": settings.AUTH_OIDC_DEFAULT_ROLE,
        "AUTH_OIDC_TELEGRAM_PRIMARY": settings.AUTH_OIDC_TELEGRAM_PRIMARY,
    }
    settings.AUTH_OIDC_ENABLED = True
    settings.AUTH_OIDC_ISSUER = ISSUER
    settings.AUTH_OIDC_CLIENT_ID = CLIENT_ID
    settings.AUTH_OIDC_CLIENT_SECRET = None
    settings.AUTH_OIDC_REDIRECT_URI = REDIRECT_URI
    settings.AUTH_OIDC_SCOPES = "openid profile email hrms_access"
    settings.AUTH_OIDC_JWKS_URL = f"{ISSUER}jwks/"
    settings.AUTH_OIDC_TOKEN_URL = "http://localhost:9000/application/o/token/"
    settings.AUTH_OIDC_ALLOW_JIT = False
    settings.AUTH_OIDC_DEFAULT_ROLE = "viewer"
    settings.AUTH_OIDC_TELEGRAM_PRIMARY = False
    OidcAuthService.clear_jwks_cache()
    try:
        yield
    finally:
        for k, v in originals.items():
            setattr(settings, k, v)
        OidcAuthService.clear_jwks_cache()


@pytest.fixture
def oidc_disabled():
    original = settings.AUTH_OIDC_ENABLED
    settings.AUTH_OIDC_ENABLED = False
    try:
        yield
    finally:
        settings.AUTH_OIDC_ENABLED = original


async def _create_user(
    db: AsyncSession,
    *,
    username: str = "oidc_user",
    role: str = "viewer",
    authentik_sub: str | None = None,
    telegram_id: int | None = None,
    telegram_username: str | None = None,
) -> User:
    user = User(
        username=username,
        password_hash=SSO_BYPASS_HASH,
        role=role,
        full_name="OIDC Local User",
        authentik_sub=authentik_sub,
        telegram_id=telegram_id,
        telegram_username=telegram_username,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


# ─── config / disabled ───────────────────────────────────────────────────────


async def test_oidc_config_disabled(oidc_disabled):
    resp = await oidc_config()
    assert resp.enabled is False
    assert resp.client_id is None
    assert resp.authorization_url is None


async def test_oidc_config_enabled(oidc_enabled):
    resp = await oidc_config()
    assert resp.enabled is True
    assert resp.client_id == CLIENT_ID
    assert resp.redirect_uri == REDIRECT_URI
    assert resp.issuer == ISSUER.rstrip("/")
    assert "openid" in (resp.scopes or "")
    assert resp.authorization_url
    assert "authorize" in resp.authorization_url
    assert resp.telegram_primary is False


async def test_oidc_config_telegram_primary(oidc_enabled):
    settings.AUTH_OIDC_TELEGRAM_PRIMARY = True
    resp = await oidc_config()
    assert resp.enabled is True
    assert resp.telegram_primary is True


async def test_oidc_logout_url_enabled(oidc_enabled):
    resp = await oidc_logout_url()
    assert resp.enabled is True
    assert resp.logout_url
    assert "end-session" in resp.logout_url
    assert "login" in (resp.logout_url or "")


async def test_oidc_callback_disabled_404(oidc_disabled, db_session: AsyncSession):
    req = _make_request()
    with pytest.raises(HTTPException) as ei:
        await oidc_callback(
            OidcCallbackRequest(code="x", code_verifier="y"),
            req,
            db_session,
        )
    assert ei.value.status_code == 404


# ─── happy path: link by username + complete_login ───────────────────────────


async def test_oidc_callback_links_by_username_and_creates_session(
    oidc_enabled, db_session: AsyncSession
):
    user = await _create_user(db_session, username="oidc_user", role="viewer")
    id_token = _make_id_token(
        sub="ak-sub-link-1",
        preferred_username="oidc_user",
        hrms_access_level="admin",
    )
    token_body = {
        "access_token": "idp-access",
        "id_token": id_token,
        "token_type": "Bearer",
    }
    fake = _FakeAsyncClient(token_body=token_body)

    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        result = await oidc_callback(
            OidcCallbackRequest(
                code="auth-code-1",
                code_verifier="verifier-abc",
                state="state-xyz",
            ),
            _make_request(),
            db_session,
        )

    assert isinstance(result, LoginResponse)
    assert result.username == "oidc_user"
    assert result.role == "admin"  # synced from claim
    assert result.access_token

    # App JWT has sid
    secret = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    payload = jose_jwt.decode(result.access_token, secret, algorithms=[settings.ALGORITHM])
    assert payload.get("sid")
    assert payload.get("username") == "oidc_user"
    assert payload.get("hrms_access_level") == "admin"
    sid = UUID(payload["sid"])

    # Session row exists with login_method=oidc
    sess = await db_session.get(UserSession, sid)
    assert sess is not None
    assert sess.user_id == user.id
    assert sess.login_method == "oidc"
    assert sess.revoked_at is None

    # authentik_sub linked
    await db_session.refresh(user)
    assert user.authentik_sub == "ak-sub-link-1"

    # Token exchange used PKCE verifier
    assert fake.posts
    assert fake.posts[0]["data"]["code_verifier"] == "verifier-abc"
    assert fake.posts[0]["data"]["code"] == "auth-code-1"


async def test_oidc_callback_by_authentik_sub(
    oidc_enabled, db_session: AsyncSession
):
    user = await _create_user(
        db_session,
        username="linked_already",
        authentik_sub="ak-sub-known",
        role="viewer",
    )
    id_token = _make_id_token(
        sub="ak-sub-known",
        preferred_username="other_name",
        hrms_access_level="viewer",
    )
    fake = _FakeAsyncClient(
        token_body={"access_token": "a", "id_token": id_token, "token_type": "Bearer"}
    )
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        result = await oidc_callback(
            OidcCallbackRequest(code="c", code_verifier="v"),
            _make_request(),
            db_session,
        )
    assert result.username == "linked_already"
    assert result.access_token


async def test_oidc_callback_links_by_telegram_id_claim(
    oidc_enabled, db_session: AsyncSession
):
    """TG1: existing users.telegram_id matched via id_token claim telegram_id."""
    user = await _create_user(
        db_session,
        username="tg_prelinked",
        role="viewer",
        telegram_id=424242424,
        telegram_username="old_tg_name",
    )
    id_token = _make_id_token(
        sub="ak-sub-from-tg",
        preferred_username="does_not_match_local",
        email="nope@example.com",
        hrms_access_level="viewer",
        extra={
            "telegram_id": "424242424",  # string as Authentik may emit
            "telegram_username": "new_tg_name",
        },
    )
    fake = _FakeAsyncClient(
        token_body={"access_token": "a", "id_token": id_token, "token_type": "Bearer"}
    )
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        result = await oidc_callback(
            OidcCallbackRequest(code="c", code_verifier="v"),
            _make_request(),
            db_session,
        )

    assert result.username == "tg_prelinked"
    assert result.access_token

    await db_session.refresh(user)
    assert user.authentik_sub == "ak-sub-from-tg"
    assert user.telegram_id == 424242424
    assert user.telegram_username == "new_tg_name"

    secret = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    payload = jose_jwt.decode(result.access_token, secret, algorithms=[settings.ALGORITHM])
    sid = UUID(payload["sid"])
    sess = await db_session.get(UserSession, sid)
    assert sess is not None
    assert sess.login_method == "oidc_telegram"


async def test_oidc_callback_telegram_id_int_claim(
    oidc_enabled, db_session: AsyncSession
):
    """telegram_id as int in JWT is accepted."""
    user = await _create_user(
        db_session,
        username="tg_int_claim",
        telegram_id=111222333,
    )
    id_token = _make_id_token(
        sub="ak-sub-tg-int",
        preferred_username="zzz_unknown",
        email=None,
        extra={"telegram_id": 111222333},
    )
    fake = _FakeAsyncClient(
        token_body={"access_token": "a", "id_token": id_token, "token_type": "Bearer"}
    )
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        result = await oidc_callback(
            OidcCallbackRequest(code="c", code_verifier="v"),
            _make_request(),
            db_session,
        )
    assert result.username == "tg_int_claim"
    await db_session.refresh(user)
    assert user.authentik_sub == "ak-sub-tg-int"


# ─── failures ────────────────────────────────────────────────────────────────


async def test_oidc_callback_no_local_user_403(
    oidc_enabled, db_session: AsyncSession
):
    settings.AUTH_OIDC_ALLOW_JIT = False
    id_token = _make_id_token(
        sub="ak-unknown",
        preferred_username="nobody_here",
        email="nobody@example.com",
    )
    fake = _FakeAsyncClient(
        token_body={"access_token": "a", "id_token": id_token, "token_type": "Bearer"}
    )
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        with pytest.raises(HTTPException) as ei:
            await oidc_callback(
                OidcCallbackRequest(code="c", code_verifier="v"),
                _make_request(),
                db_session,
            )
    assert ei.value.status_code == 403
    assert ei.value.detail == "oidc_user_not_linked"


async def test_oidc_callback_invalid_token_exchange_401(
    oidc_enabled, db_session: AsyncSession
):
    fake = _FakeAsyncClient(token_body=None, token_status=400)
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        with pytest.raises(HTTPException) as ei:
            await oidc_callback(
                OidcCallbackRequest(code="bad", code_verifier="v"),
                _make_request(),
                db_session,
            )
    assert ei.value.status_code == 401


async def test_oidc_callback_bad_signature_401(
    oidc_enabled, db_session: AsyncSession
):
    await _create_user(db_session, username="oidc_user")
    # Sign with a different key
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    now = int(time.time())
    bad_token = jose_jwt.encode(
        {
            "sub": "x",
            "preferred_username": "oidc_user",
            "aud": CLIENT_ID,
            "iss": ISSUER.rstrip("/"),
            "iat": now,
            "exp": now + 3600,
        },
        other_pem,
        algorithm="RS256",
        headers={"kid": KID},
    )
    fake = _FakeAsyncClient(
        token_body={"access_token": "a", "id_token": bad_token, "token_type": "Bearer"}
    )
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        with pytest.raises(HTTPException) as ei:
            await oidc_callback(
                OidcCallbackRequest(code="c", code_verifier="v"),
                _make_request(),
                db_session,
            )
    assert ei.value.status_code == 401


async def test_oidc_callback_expired_token_401(
    oidc_enabled, db_session: AsyncSession
):
    await _create_user(db_session, username="oidc_user")
    id_token = _make_id_token(preferred_username="oidc_user", exp_delta=-100)
    fake = _FakeAsyncClient(
        token_body={"access_token": "a", "id_token": id_token, "token_type": "Bearer"}
    )
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        with pytest.raises(HTTPException) as ei:
            await oidc_callback(
                OidcCallbackRequest(code="c", code_verifier="v"),
                _make_request(),
                db_session,
            )
    assert ei.value.status_code == 401


async def test_oidc_callback_no_access_claim_403(
    oidc_enabled, db_session: AsyncSession
):
    await _create_user(db_session, username="oidc_user")
    id_token = _make_id_token(
        preferred_username="oidc_user",
        hrms_access_level="no_access",
    )
    fake = _FakeAsyncClient(
        token_body={"access_token": "a", "id_token": id_token, "token_type": "Bearer"}
    )
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        with pytest.raises(HTTPException) as ei:
            await oidc_callback(
                OidcCallbackRequest(code="c", code_verifier="v"),
                _make_request(),
                db_session,
            )
    assert ei.value.status_code == 403
    assert ei.value.detail == "no_access"


# ─── JIT ─────────────────────────────────────────────────────────────────────


async def test_oidc_callback_jit_creates_user(
    oidc_enabled, db_session: AsyncSession
):
    settings.AUTH_OIDC_ALLOW_JIT = True
    id_token = _make_id_token(
        sub="ak-jit-sub",
        preferred_username="jit_newbie",
        name="JIT Newbie",
        hrms_access_level="viewer",
    )
    fake = _FakeAsyncClient(
        token_body={"access_token": "a", "id_token": id_token, "token_type": "Bearer"}
    )
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        result = await oidc_callback(
            OidcCallbackRequest(code="c", code_verifier="v"),
            _make_request(),
            db_session,
        )
    assert result.username == "jit_newbie"
    assert result.role == "viewer"
    row = (
        await db_session.execute(
            select(User).where(User.username == "jit_newbie", User.is_deleted == False)
        )
    ).scalar_one()
    assert row.authentik_sub == "ak-jit-sub"
    assert row.password_hash == SSO_BYPASS_HASH


# ─── service unit: URL derivation ────────────────────────────────────────────


async def test_resolve_urls(oidc_enabled):
    assert "authorize" in OidcAuthService.resolve_authorization_url()
    assert "token" in OidcAuthService.resolve_token_url()
    assert "jwks" in OidcAuthService.resolve_jwks_url()
    assert "end-session" in OidcAuthService.resolve_end_session_url()
