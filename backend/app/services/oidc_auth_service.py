"""OIDC / Authentik bridge: token exchange, id_token JWKS verify, user link → complete_login.

Flow (public SPA + PKCE):
  FE authorize → Authentik → FE /auth/callback → POST /api/auth/oidc/callback
  → exchange code → validate id_token → resolve User → complete_login(oidc)
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode, urljoin

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt
from jose.backends import RSAKey
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services import session_service

logger = logging.getLogger(__name__)

# In-process JWKS cache: {url: (fetched_at_monotonic, jwks_dict)}
_JWKS_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_JWKS_TTL_SECONDS = 3600

# Valid hrms_access_level claim values (align deps.py / Authentik scope mapping)
_ACCESS_LEVELS = frozenset({"admin", "viewer", "no_access"})


@dataclass(frozen=True)
class OidcClaims:
    """Normalized claims extracted from validated id_token."""

    sub: str
    preferred_username: str | None
    email: str | None
    name: str | None
    hrms_access_level: str | None


class OidcAuthService:
    """Business logic for OIDC bridge (layer: service)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.users = UserRepository()

    # ─── config helpers ───────────────────────────────────────────────────

    @staticmethod
    def is_enabled() -> bool:
        return bool(settings.AUTH_OIDC_ENABLED)

    @staticmethod
    def _issuer() -> str:
        issuer = (settings.AUTH_OIDC_ISSUER or "").strip()
        if not issuer:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OIDC issuer not configured",
            )
        return issuer if issuer.endswith("/") else issuer + "/"

    @classmethod
    def resolve_authorization_url(cls) -> str:
        if settings.AUTH_OIDC_AUTHORIZATION_URL:
            return settings.AUTH_OIDC_AUTHORIZATION_URL.rstrip("/")
        # Authentik per-provider: shared authorize endpoint under /application/o/
        issuer = cls._issuer()
        # issuer = …/application/o/hrms/ → …/application/o/authorize/
        base = issuer.rsplit("/", 2)[0] + "/"  # …/application/o/
        return urljoin(base, "authorize/")

    @classmethod
    def resolve_token_url(cls) -> str:
        if settings.AUTH_OIDC_TOKEN_URL:
            return settings.AUTH_OIDC_TOKEN_URL
        issuer = cls._issuer()
        base = issuer.rsplit("/", 2)[0] + "/"
        return urljoin(base, "token/")

    @classmethod
    def resolve_jwks_url(cls) -> str:
        if settings.AUTH_OIDC_JWKS_URL:
            return settings.AUTH_OIDC_JWKS_URL
        return urljoin(cls._issuer(), "jwks/")

    @classmethod
    def resolve_end_session_url(cls) -> str:
        if settings.AUTH_OIDC_END_SESSION_URL:
            return settings.AUTH_OIDC_END_SESSION_URL
        return urljoin(cls._issuer(), "end-session/")

    @classmethod
    def public_config(cls) -> dict[str, Any]:
        """Payload for GET /auth/oidc/config (no secrets)."""
        if not cls.is_enabled():
            return {
                "enabled": False,
                "authorization_url": None,
                "client_id": None,
                "redirect_uri": None,
                "scopes": None,
                "issuer": None,
            }
        try:
            auth_url = cls.resolve_authorization_url()
            issuer = cls._issuer()
        except HTTPException:
            return {
                "enabled": True,
                "authorization_url": None,
                "client_id": settings.AUTH_OIDC_CLIENT_ID,
                "redirect_uri": settings.AUTH_OIDC_REDIRECT_URI,
                "scopes": settings.AUTH_OIDC_SCOPES,
                "issuer": settings.AUTH_OIDC_ISSUER,
            }
        return {
            "enabled": True,
            "authorization_url": auth_url,
            "client_id": settings.AUTH_OIDC_CLIENT_ID,
            "redirect_uri": settings.AUTH_OIDC_REDIRECT_URI,
            "scopes": settings.AUTH_OIDC_SCOPES,
            "issuer": issuer.rstrip("/"),
        }

    @classmethod
    def logout_url(cls, *, id_token_hint: str | None = None, post_logout_redirect_uri: str | None = None) -> str | None:
        if not cls.is_enabled():
            return None
        try:
            base = cls.resolve_end_session_url()
        except HTTPException:
            return None
        params: dict[str, str] = {}
        if id_token_hint:
            params["id_token_hint"] = id_token_hint
        if post_logout_redirect_uri:
            params["post_logout_redirect_uri"] = post_logout_redirect_uri
        elif settings.AUTH_OIDC_REDIRECT_URI:
            # Default post-logout to FE /login (origin of redirect_uri)
            redirect = settings.AUTH_OIDC_REDIRECT_URI
            # http://localhost:5173/auth/callback → http://localhost:5173/login
            if "/auth/callback" in redirect:
                params["post_logout_redirect_uri"] = redirect.replace(
                    "/auth/callback", "/login"
                )
        if params:
            sep = "&" if "?" in base else "?"
            return f"{base}{sep}{urlencode(params)}"
        return base

    # ─── HTTP: token + JWKS ───────────────────────────────────────────────

    async def exchange_code(
        self,
        *,
        code: str,
        code_verifier: str,
        redirect_uri: str,
    ) -> dict[str, Any]:
        """POST token_endpoint with authorization_code + PKCE."""
        token_url = self.resolve_token_url()
        client_id = settings.AUTH_OIDC_CLIENT_ID
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OIDC client_id not configured",
            )
        data: dict[str, str] = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "code_verifier": code_verifier,
        }
        secret = (settings.AUTH_OIDC_CLIENT_SECRET or "").strip()
        if secret:
            data["client_secret"] = secret

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    token_url,
                    data=data,
                    headers={"Accept": "application/json"},
                )
        except httpx.HTTPError as exc:
            logger.warning("OIDC token exchange network error: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="OIDC token endpoint unreachable",
            ) from exc

        if resp.status_code >= 400:
            logger.warning(
                "OIDC token exchange failed status=%s body=%s",
                resp.status_code,
                resp.text[:500],
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_oidc_code",
            )

        try:
            body = resp.json()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="OIDC token response invalid",
            ) from exc

        if "id_token" not in body:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_oidc_token_response",
            )
        return body

    async def fetch_jwks(self) -> dict[str, Any]:
        """Fetch JWKS with simple TTL cache."""
        url = self.resolve_jwks_url()
        now = time.monotonic()
        cached = _JWKS_CACHE.get(url)
        if cached and (now - cached[0]) < _JWKS_TTL_SECONDS:
            return cached[1]

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers={"Accept": "application/json"})
                resp.raise_for_status()
                jwks = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("OIDC JWKS fetch failed: %s", exc)
            if cached:
                return cached[1]
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="OIDC JWKS unavailable",
            ) from exc

        _JWKS_CACHE[url] = (now, jwks)
        return jwks

    @staticmethod
    def clear_jwks_cache() -> None:
        """Test helper / ops."""
        _JWKS_CACHE.clear()

    async def validate_id_token(self, id_token: str) -> OidcClaims:
        """Verify signature (JWKS), iss, aud, exp; return normalized claims."""
        # Authentik per-provider issuer usually has trailing slash; accept both.
        issuer_with = self._issuer()  # trailing /
        issuer_bare = issuer_with.rstrip("/")
        client_id = settings.AUTH_OIDC_CLIENT_ID
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OIDC client_id not configured",
            )

        try:
            header = jwt.get_unverified_header(id_token)
        except JWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_id_token",
            ) from exc

        kid = header.get("kid")
        alg = header.get("alg", "RS256")
        jwks = await self.fetch_jwks()
        keys = jwks.get("keys") or []
        matching = None
        for key in keys:
            if kid and key.get("kid") == kid:
                matching = key
                break
            if not kid and key.get("kty") == "RSA":
                matching = key
                break
        if matching is None and keys:
            matching = keys[0]
        if matching is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_id_token_key",
            )

        claims: dict[str, Any] | None = None
        last_err: Exception | None = None
        try:
            rsa_key = RSAKey(matching, algorithm=alg)
        except Exception as exc:  # noqa: BLE001
            logger.info("OIDC JWKS key load failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_id_token_key",
            ) from exc

        for issuer_candidate in (issuer_with, issuer_bare):
            try:
                claims = jwt.decode(
                    id_token,
                    rsa_key,
                    algorithms=[alg],
                    audience=client_id,
                    issuer=issuer_candidate,
                    options={
                        "verify_at_hash": False,
                        "require_exp": True,
                        "require_iat": False,
                        "require_nbf": False,
                    },
                )
                break
            except JWTError as exc:
                last_err = exc
                continue

        if claims is None:
            logger.info("OIDC id_token validation failed: %s", last_err)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_id_token",
            )

        sub = claims.get("sub")
        if not sub or not isinstance(sub, str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_id_token_sub",
            )

        access_level = claims.get("hrms_access_level")
        if access_level is not None and access_level not in _ACCESS_LEVELS:
            access_level = None

        return OidcClaims(
            sub=sub,
            preferred_username=claims.get("preferred_username") or claims.get("nickname"),
            email=claims.get("email"),
            name=claims.get("name"),
            hrms_access_level=access_level if isinstance(access_level, str) else None,
        )

    # ─── user resolve / link ──────────────────────────────────────────────

    async def resolve_or_provision_user(self, claims: OidcClaims) -> User:
        """
        1. by authentik_sub
        2. by preferred_username / email as local username
        3. if AUTH_OIDC_ALLOW_JIT: create
        4. else 403 oidc_user_not_linked
        """
        user = await self.users.get_by_authentik_sub(self.db, claims.sub)
        if user is not None:
            await self._maybe_sync_role(user, claims)
            return user

        candidates: list[str] = []
        if claims.preferred_username:
            candidates.append(claims.preferred_username.strip())
        if claims.email:
            email = claims.email.strip()
            if email and email not in candidates:
                candidates.append(email)
            local = email.split("@", 1)[0] if email else ""
            if local and local not in candidates:
                candidates.append(local)

        for name in candidates:
            if not name:
                continue
            found = await self.users.get_by_username(self.db, name[:100])
            if found is not None:
                await self.users.link_authentik_sub(self.db, found, claims.sub)
                await self._maybe_sync_role(found, claims)
                return found

        if not settings.AUTH_OIDC_ALLOW_JIT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="oidc_user_not_linked",
            )

        username = await self._pick_username(candidates, claims.sub)
        role = self._role_from_claims(claims)
        full_name = (claims.name or username).strip()[:255]
        return await self.users.create_oidc_user(
            self.db,
            username=username,
            full_name=full_name or username,
            role=role,
            authentik_sub=claims.sub,
        )

    async def _pick_username(self, candidates: list[str], sub: str) -> str:
        for name in candidates:
            candidate = name.strip()[:100]
            if not candidate:
                continue
            existing = await self.users.get_by_username(self.db, candidate)
            if existing is None:
                return candidate
        # Fallback: oidc_<short sub>
        safe = "".join(c for c in sub if c.isalnum())[:24] or "user"
        base = f"oidc_{safe}"[:100]
        existing = await self.users.get_by_username(self.db, base)
        if existing is None:
            return base
        return f"oidc_{safe}_{int(time.time()) % 100000}"[:100]

    def _role_from_claims(self, claims: OidcClaims) -> str:
        level = claims.hrms_access_level
        if level == "admin":
            return "admin"
        if level == "viewer":
            return "viewer"
        default = (settings.AUTH_OIDC_DEFAULT_ROLE or "viewer").strip()
        return default if default in ("admin", "viewer") else "viewer"

    async def _maybe_sync_role(self, user: User, claims: OidcClaims) -> None:
        """Sync local role from IdP hrms_access_level when present (admin|viewer)."""
        level = claims.hrms_access_level
        if level not in ("admin", "viewer"):
            return
        if user.role != level:
            user.role = level
            self.db.add(user)
            await self.db.flush()
            await self.db.refresh(user)

    # ─── full callback ────────────────────────────────────────────────────

    async def handle_callback(
        self,
        *,
        code: str,
        code_verifier: str,
        redirect_uri: str | None = None,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> dict[str, Any]:
        """
        Exchange code → validate id_token → resolve user → complete_login.
        Returns LoginResponse-compatible dict.
        """
        if not self.is_enabled():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="OIDC login disabled",
            )

        redir = (redirect_uri or settings.AUTH_OIDC_REDIRECT_URI or "").strip()
        if not redir:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OIDC redirect_uri not configured",
            )

        token_body = await self.exchange_code(
            code=code,
            code_verifier=code_verifier,
            redirect_uri=redir,
        )
        id_token = token_body["id_token"]

        try:
            claims = await self.validate_id_token(id_token)
        except HTTPException as exc:
            await session_service.record_failed_login(
                self.db,
                username_attempted=None,
                reason="invalid_id_token",
                method="oidc",
                ip=ip,
                user_agent=user_agent,
            )
            raise exc

        try:
            user = await self.resolve_or_provision_user(claims)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                await session_service.record_failed_login(
                    self.db,
                    username_attempted=claims.preferred_username or claims.email or claims.sub,
                    reason="oidc_user_not_linked",
                    method="oidc",
                    ip=ip,
                    user_agent=user_agent,
                )
            raise

        # Block no_access from IdP claim (align deps.py)
        if claims.hrms_access_level == "no_access":
            await session_service.record_failed_login(
                self.db,
                username_attempted=user.username,
                reason="no_access",
                method="oidc",
                ip=ip,
                user_agent=user_agent,
                user_id=user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="no_access",
            )

        token, _session = await session_service.complete_login(
            self.db,
            user=user,
            login_method="oidc",
            ip=ip,
            user_agent=user_agent,
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": user.username,
            "role": user.role,
            "full_name": user.full_name or user.username,
        }
