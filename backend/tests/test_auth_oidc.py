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

from app.api.auth import (
    LoginResponse,
    backchannel_logout,
    oidc_callback,
    oidc_config,
    oidc_logout_url,
)
from app.core.config import settings
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.oidc_auth import OidcCallbackRequest
from app.services import session_service
from app.services.oidc_auth_service import LogoutClaims, OidcAuthService


pytestmark = pytest.mark.asyncio(loop_scope="module")

ISSUER = "http://localhost:9000/application/o/hrms/"
CLIENT_ID = "hrms"
REDIRECT_URI = "http://localhost:5171/auth/callback"
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
    hrms_role: str | None = "viewer",
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
    if hrms_role is not None:
        claims["hrms_role"] = hrms_role
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
) -> User:
    user = User(
        username=username,
        role=role,
        full_name="OIDC Local User",
        authentik_sub=authentik_sub,
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


async def test_oidc_logout_url_enabled(oidc_enabled):
    # Without id_token_hint: bare end-session (Authentik rejects post_logout alone)
    resp = await oidc_logout_url()
    assert resp.enabled is True
    assert resp.logout_url
    assert "end-session" in resp.logout_url
    assert "post_logout_redirect_uri" not in (resp.logout_url or "")
    # With id_token_hint: post_logout allowed
    resp2 = await oidc_logout_url(
        id_token_hint="dummy.jwt.hint",
        post_logout_redirect_uri="http://localhost:5171/login",
    )
    assert resp2.logout_url
    assert "id_token_hint" in (resp2.logout_url or "")
    assert "login" in (resp2.logout_url or "")


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
        hrms_role="admin",
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
    # Fail-closed sync: claim overwrites users.role unconditionally
    assert result.role == "admin"
    assert result.access_token

    # App JWT has sid
    secret = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    payload = jose_jwt.decode(result.access_token, secret, algorithms=[settings.ALGORITHM])
    assert payload.get("sid")
    assert payload.get("username") == "oidc_user"
    # JWT hrms_access_level mirrors synced users.role
    assert payload.get("hrms_access_level") == "admin"
    sid = UUID(payload["sid"])

    # Session row exists with login_method=oidc
    sess = await db_session.get(UserSession, sid)
    assert sess is not None
    assert sess.user_id == user.id
    assert sess.login_method == "oidc"
    assert sess.revoked_at is None

    # authentik_sub linked; role synced from IdP claim
    await db_session.refresh(user)
    assert user.authentik_sub == "ak-sub-link-1"
    assert user.role == "admin"

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
        hrms_role="viewer",
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
    user = await _create_user(db_session, username="oidc_user")
    id_token = _make_id_token(
        preferred_username="oidc_user",
        hrms_role="no_access",
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
    # fail-closed: user deactivated
    await db_session.refresh(user)
    assert user.is_active is False


async def test_oidc_callback_conflict_role_rejects(
    oidc_enabled, db_session: AsyncSession
):
    """claim hrms_role=conflict → 403 role_conflict."""
    await _create_user(db_session, username="oidc_user")
    id_token = _make_id_token(
        preferred_username="oidc_user",
        hrms_role="conflict",
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
    assert ei.value.detail == "role_conflict"


async def test_oidc_callback_absent_role_fail_closed(
    oidc_enabled, db_session: AsyncSession
):
    """claim hrms_role absent → fail-closed: 403 + is_active=False."""
    user = await _create_user(db_session, username="oidc_user")
    id_token = _make_id_token(
        preferred_username="oidc_user",
        hrms_role=None,  # absent
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
    await db_session.refresh(user)
    assert user.is_active is False


# ─── JIT ─────────────────────────────────────────────────────────────────────


async def test_oidc_callback_jit_creates_user(
    oidc_enabled, db_session: AsyncSession
):
    settings.AUTH_OIDC_ALLOW_JIT = True
    id_token = _make_id_token(
        sub="ak-jit-sub",
        preferred_username="jit_newbie",
        name="JIT Newbie",
        hrms_role="viewer",
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


async def test_oidc_jit_uses_claim_role(
    oidc_enabled, db_session: AsyncSession
):
    """JIT: role taken directly from hrms_role claim (fail-closed, no default)."""
    settings.AUTH_OIDC_ALLOW_JIT = True
    id_token = _make_id_token(
        sub="ak-jit-admin-claim",
        preferred_username="jit_admin_claim",
        name="JIT Admin Claim",
        hrms_role="admin",
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
    assert result.username == "jit_admin_claim"
    assert result.role == "admin"
    row = (
        await db_session.execute(
            select(User).where(
                User.username == "jit_admin_claim", User.is_deleted == False
            )
        )
    ).scalar_one()
    assert row.role == "admin"


# ─── service unit: URL derivation ────────────────────────────────────────────


async def test_resolve_urls(oidc_enabled):
    assert "authorize" in OidcAuthService.resolve_authorization_url()
    assert "token" in OidcAuthService.resolve_token_url()
    assert "jwks" in OidcAuthService.resolve_jwks_url()
    assert "end-session" in OidcAuthService.resolve_end_session_url()


# ─── back-channel logout ─────────────────────────────────────────────────────

_BC_EVENT = "http://schemas.openid.net/event/backchannel-logout"


def _make_logout_token(
    *,
    sub: str = "ak-sub-uuid-001",
    aud: str = CLIENT_ID,
    iss: str = ISSUER.rstrip("/"),
    exp_delta: int = 120,
    events: dict | None = None,
    nonce: str | None = None,
    include_sub: bool = True,
    extra: dict | None = None,
    private_pem=None,
) -> str:
    now = int(time.time())
    claims: dict = {
        "aud": aud,
        "iss": iss,
        "iat": now,
        "exp": now + exp_delta,
        "jti": f"logout-jti-{now}",
        "events": events if events is not None else {_BC_EVENT: {}},
    }
    if include_sub:
        claims["sub"] = sub
    if nonce is not None:
        claims["nonce"] = nonce
    if extra:
        claims.update(extra)
    return jose_jwt.encode(
        claims,
        private_pem if private_pem is not None else _PRIVATE_PEM,
        algorithm="RS256",
        headers={"kid": KID},
    )


async def test_validate_logout_token_happy(oidc_enabled):
    token = _make_logout_token(sub="sub-ok", extra={"sid": "idp-sid-1"})
    fake = _FakeAsyncClient()
    svc = OidcAuthService(MagicMock())
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        claims = await svc.validate_logout_token(token)
    assert isinstance(claims, LogoutClaims)
    assert claims.sub == "sub-ok"
    assert claims.sid == "idp-sid-1"
    assert claims.jti


async def test_validate_logout_token_wrong_aud(oidc_enabled):
    token = _make_logout_token(aud="other-client")
    fake = _FakeAsyncClient()
    svc = OidcAuthService(MagicMock())
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        with pytest.raises(HTTPException) as ei:
            await svc.validate_logout_token(token)
    assert ei.value.status_code == 400


async def test_validate_logout_token_missing_events(oidc_enabled):
    token = _make_logout_token(events={})
    fake = _FakeAsyncClient()
    svc = OidcAuthService(MagicMock())
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        with pytest.raises(HTTPException) as ei:
            await svc.validate_logout_token(token)
    assert ei.value.status_code == 400


async def test_validate_logout_token_rejects_nonce(oidc_enabled):
    token = _make_logout_token(nonce="must-not-be-present")
    fake = _FakeAsyncClient()
    svc = OidcAuthService(MagicMock())
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        with pytest.raises(HTTPException) as ei:
            await svc.validate_logout_token(token)
    assert ei.value.status_code == 400


async def test_validate_logout_token_bad_signature(oidc_enabled):
    other_pem, _ = _generate_rsa_pair()
    token = _make_logout_token(private_pem=other_pem)
    fake = _FakeAsyncClient()
    svc = OidcAuthService(MagicMock())
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        with pytest.raises(HTTPException) as ei:
            await svc.validate_logout_token(token)
    assert ei.value.status_code == 400


async def test_backchannel_logout_revokes_sessions(
    oidc_enabled, db_session: AsyncSession
):
    user = await _create_user(
        db_session, username="bc_user", authentik_sub="ak-bc-sub-1"
    )
    await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="127.0.0.1",
        user_agent="pytest",
        login_method="oidc",
        ttl_minutes=60,
    )
    await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="127.0.0.1",
        user_agent="pytest-2",
        login_method="break_glass",
        ttl_minutes=60,
    )
    token = _make_logout_token(sub="ak-bc-sub-1")
    fake = _FakeAsyncClient()
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        resp = await backchannel_logout(logout_token=token, db=db_session)
    assert resp.status_code == 200
    assert resp.headers.get("cache-control") == "no-store"
    body = json.loads(bytes(resp.body))
    assert body["status"] == "ok"
    assert body["revoked"] == 2
    active = await session_service.list_sessions(db_session, user_id=user.id)
    assert active == []


async def test_backchannel_logout_unknown_sub_noop(
    oidc_enabled, db_session: AsyncSession
):
    token = _make_logout_token(sub="no-such-authentik-sub")
    fake = _FakeAsyncClient()
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        resp = await backchannel_logout(logout_token=token, db=db_session)
    assert resp.status_code == 200
    body = json.loads(bytes(resp.body))
    assert body == {"status": "ok", "revoked": 0}


async def test_backchannel_logout_invalid_token_400(
    oidc_enabled, db_session: AsyncSession
):
    with pytest.raises(HTTPException) as ei:
        await backchannel_logout(logout_token="not-a-jwt", db=db_session)
    assert ei.value.status_code == 400


async def test_backchannel_logout_missing_token_400(db_session: AsyncSession):
    with pytest.raises(HTTPException) as ei:
        await backchannel_logout(logout_token=None, db=db_session)
    assert ei.value.status_code == 400


# ─── Phase-1 SLO: sid-корреляция, replay-защита, аудит, feature-флаг ─────────


async def _login_events(db: AsyncSession, user_id: int) -> list:
    from app.models.user_login_event import UserLoginEvent

    rows = (
        await db.execute(
            select(UserLoginEvent).where(UserLoginEvent.user_id == user_id)
        )
    ).scalars().all()
    return list(rows)


async def test_oidc_callback_stores_oidc_sid(oidc_enabled, db_session: AsyncSession):
    """sid claim из id_token сохраняется в user_sessions.oidc_sid при OIDC-логине."""
    await _create_user(db_session, username="sid_user", authentik_sub="ak-sid-sub")
    id_token = _make_id_token(sub="ak-sid-sub", extra={"sid": "idp-sid-callback-1"})
    fake = _FakeAsyncClient(
        token_body={"access_token": "a", "id_token": id_token, "token_type": "Bearer"}
    )
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        await oidc_callback(
            OidcCallbackRequest(code="c", code_verifier="v"),
            _make_request(),
            db_session,
        )
    row = (
        await db_session.execute(
            select(UserSession).where(UserSession.login_method == "oidc")
        )
    ).scalar_one()
    assert row.oidc_sid == "idp-sid-callback-1"


async def test_backchannel_logout_revokes_only_matching_sid(
    oidc_enabled, db_session: AsyncSession
):
    """logout_token с sid гасит только сессию с этим sid, не трогая вторую сессию."""
    user = await _create_user(
        db_session, username="bc_sid_user", authentik_sub="ak-bc-sid-sub"
    )
    await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="127.0.0.1",
        user_agent="browser-1",
        login_method="oidc",
        ttl_minutes=60,
        oidc_sid="idp-sid-A",
    )
    await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="127.0.0.1",
        user_agent="browser-2",
        login_method="oidc",
        ttl_minutes=60,
        oidc_sid="idp-sid-B",
    )
    token = _make_logout_token(sub="ak-bc-sid-sub", extra={"sid": "idp-sid-A"})
    fake = _FakeAsyncClient()
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        resp = await backchannel_logout(logout_token=token, db=db_session)
    assert resp.status_code == 200
    body = json.loads(bytes(resp.body))
    assert body["revoked"] == 1

    active = await session_service.list_sessions(db_session, user_id=user.id)
    assert len(active) == 1
    assert active[0].oidc_sid == "idp-sid-B"

    # Аудит: источник отзыва зафиксирован
    revoke_events = [
        e for e in await _login_events(db_session, user.id)
        if e.event_type == "session_revoke"
    ]
    assert len(revoke_events) == 1
    details = revoke_events[0].details
    assert details["source"] == "authentik_backchannel"
    assert details["reason"] == "backchannel_logout"
    assert details["oidc_sid"] == "idp-sid-A"
    assert details["revoked"] == 1


async def test_backchannel_logout_no_sid_falls_back_to_revoke_all(
    oidc_enabled, db_session: AsyncSession
):
    """logout_token без sid (деактивация пользователя) гасит все сессии + аудит."""
    user = await _create_user(
        db_session, username="bc_nosid_user", authentik_sub="ak-bc-nosid-sub"
    )
    await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="127.0.0.1",
        user_agent="browser-1",
        login_method="oidc",
        ttl_minutes=60,
        oidc_sid="idp-sid-X",
    )
    await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="127.0.0.1",
        user_agent="browser-2",
        login_method="break_glass",
        ttl_minutes=60,
    )
    token = _make_logout_token(sub="ak-bc-nosid-sub")
    fake = _FakeAsyncClient()
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        resp = await backchannel_logout(logout_token=token, db=db_session)
    assert json.loads(bytes(resp.body))["revoked"] == 2
    assert await session_service.list_sessions(db_session, user_id=user.id) == []

    revoke_events = [
        e for e in await _login_events(db_session, user.id)
        if e.event_type == "session_revoke"
    ]
    assert len(revoke_events) == 1
    assert revoke_events[0].details["source"] == "authentik_backchannel"
    assert revoke_events[0].details["oidc_sid"] is None


async def test_backchannel_logout_replay_rejected(
    oidc_enabled, db_session: AsyncSession
):
    """Повторная доставка того же logout_token (jti) → 400, двойного revoke нет."""
    user = await _create_user(
        db_session, username="bc_replay_user", authentik_sub="ak-bc-replay-sub"
    )
    await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="127.0.0.1",
        user_agent="browser-1",
        login_method="oidc",
        ttl_minutes=60,
        oidc_sid="idp-sid-replay",
    )
    token = _make_logout_token(sub="ak-bc-replay-sub", extra={"sid": "idp-sid-replay"})
    fake = _FakeAsyncClient()
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        resp = await backchannel_logout(logout_token=token, db=db_session)
        assert json.loads(bytes(resp.body))["revoked"] == 1
        # Replay: тот же самый токен второй раз
        with pytest.raises(HTTPException) as ei:
            await backchannel_logout(logout_token=token, db=db_session)
    assert ei.value.status_code == 400
    assert ei.value.detail == "replay_logout_token"


async def test_backchannel_logout_unknown_sid_revokes_nothing(
    oidc_enabled, db_session: AsyncSession
):
    """sid из токена не совпал ни с одной сессией → 200, revoked=0, сессии живы."""
    user = await _create_user(
        db_session, username="bc_unknown_sid", authentik_sub="ak-bc-unk-sid-sub"
    )
    await session_service.issue_session(
        db_session,
        user_id=user.id,
        ip="127.0.0.1",
        user_agent="browser-1",
        login_method="oidc",
        ttl_minutes=60,
        oidc_sid="idp-sid-real",
    )
    token = _make_logout_token(sub="ak-bc-unk-sid-sub", extra={"sid": "idp-sid-other"})
    fake = _FakeAsyncClient()
    with patch("app.services.oidc_auth_service.httpx.AsyncClient", return_value=fake):
        resp = await backchannel_logout(logout_token=token, db=db_session)
    assert json.loads(bytes(resp.body))["revoked"] == 0
    active = await session_service.list_sessions(db_session, user_id=user.id)
    assert len(active) == 1


async def test_oidc_config_exposes_phase3_fields(oidc_enabled):
    """GET /auth/oidc/config returns login_hint_enabled and sso_only."""
    settings.AUTH_SSO_ONLY = True
    settings.AUTH_OIDC_LOGIN_HINT_ENABLED = True
    cfg = await oidc_config()
    assert cfg.sso_only is True
    assert cfg.login_hint_enabled is True


async def test_password_login_endpoint_removed():
    """#36: POST /auth/login удалён вместе с парольным хранилищем — маршрута нет."""
    from app.api.auth import router as auth_router

    paths = {getattr(route, "path", "") for route in auth_router.routes}
    assert "/login" not in paths


async def test_invite_login_endpoint_removed():
    """#35: POST /auth/invite/login удалён — маршрута больше нет."""
    from app.api.auth import router as auth_router

    paths = {getattr(route, "path", "") for route in auth_router.routes}
    assert "/invite/login" not in paths

