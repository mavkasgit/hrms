"""OIDC / Authentik bridge — HRMS host adapter over the shared OIDC core.

Flow (public SPA + PKCE):
  FE authorize → Authentik → FE /auth/callback → POST /api/auth/oidc/callback
  → core.exchange_code → core.validate_id_token → resolve User → complete_login

The protocol machinery (issuer candidates, JWKS + TTL cache, exchange_code,
validate_id_token, validate_logout_token, logout_url, public_config) lives in
the must-match module app/services/oidc_core.py. This file wires the HRMS
domain: role-mapping (hrms_role claim, fail-closed), user-provisioning,
session issuance via the shared session-core, and the RU error dictionary.
"""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services import session_service
from app.services.oidc_core import (
    LogoutClaims,
    OidcClaims,
    OidcCore,
    OidcCoreConfig,
    OidcHooks,
)

logger = logging.getLogger(__name__)

# Valid hrms_role claim values from IdP (align deps.py / Authentik scope mapping)
_ACCESS_LEVELS = frozenset({"admin", "viewer", "no_access", "conflict"})


def _hrms_role_from_claims(claims: OidcClaims) -> str | None:
    """Extract the HRMS-specific role claim from the raw validated id_token claims."""
    raw = claims.raw.get("hrms_role")
    if raw is None:
        return None
    value = str(raw).strip()
    return value if value in _ACCESS_LEVELS else None


class OidcAuthService:
    """Business logic for the OIDC bridge — HRMS host adapter (layer: service)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.users = UserRepository()
        self._oidc_core = OidcCore(self._core_config(), self._core_hooks())

    # ─── shared core wiring ───────────────────────────────────────────────

    @classmethod
    def _core_config(cls) -> OidcCoreConfig:
        lan: str | None = None
        try:
            from app.core.host_net import detect_lan_ip, env_lan_ip

            lan = env_lan_ip() or detect_lan_ip()
        except Exception:  # noqa: BLE001
            lan = None

        extra: list[str] = []
        for raw in (lan, settings.AUTHENTIK_PUBLIC_URL, settings.AUTHENTIK_API_URL):
            if not raw:
                continue
            text_raw = str(raw).strip()
            parsed = urlparse(text_raw if "://" in text_raw else f"http://{text_raw}")
            if parsed.hostname:
                host = parsed.hostname.strip().lower().split("%")[0]
                if host and host not in extra:
                    extra.append(host)

        def resolve_auto_origin() -> str | None:
            try:
                from app.core.host_net import resolve_authentik_origin

                return resolve_authentik_origin(None)
            except Exception:  # noqa: BLE001
                return None

        return OidcCoreConfig(
            enabled=bool(settings.AUTH_OIDC_ENABLED),
            issuer=settings.AUTH_OIDC_ISSUER,
            client_id=settings.AUTH_OIDC_CLIENT_ID,
            client_secret=settings.AUTH_OIDC_CLIENT_SECRET,
            redirect_uri=settings.AUTH_OIDC_REDIRECT_URI,
            scopes=settings.AUTH_OIDC_SCOPES,
            issuer_aliases=settings.AUTH_OIDC_ISSUER_ALIASES,
            authorization_url=settings.AUTH_OIDC_AUTHORIZATION_URL,
            token_url=settings.AUTH_OIDC_TOKEN_URL,
            jwks_url=settings.AUTH_OIDC_JWKS_URL,
            end_session_url=settings.AUTH_OIDC_END_SESSION_URL,
            auto_issuer_client_id="hrms",
            resolve_auto_origin=resolve_auto_origin,
            extra_alt_hosts=tuple(extra),
            login_hint_enabled=bool(settings.AUTH_OIDC_LOGIN_HINT_ENABLED),
            sso_only=bool(settings.AUTH_SSO_ONLY),
        )

    def _core_hooks(self) -> OidcHooks:
        return OidcHooks(
            resolve_or_provision=self.resolve_or_provision_user,
            issue_token=self._issue_token,
            record_failed_login=self._record_failed_login,
        )

    @classmethod
    def _core(cls) -> OidcCore:
        return OidcCore(cls._core_config())

    # ─── config-only delegates (no db) ────────────────────────────────────

    @classmethod
    def is_enabled(cls) -> bool:
        return cls._core().is_enabled()

    @classmethod
    def resolve_authorization_url(cls) -> str:
        return cls._core().resolve_authorization_url()

    @classmethod
    def resolve_token_url(cls) -> str:
        return cls._core().resolve_token_url()

    @classmethod
    def resolve_jwks_url(cls) -> str:
        return cls._core().resolve_jwks_url()

    @classmethod
    def resolve_end_session_url(cls) -> str:
        return cls._core().resolve_end_session_url()

    @classmethod
    def public_config(cls) -> dict[str, Any]:
        return cls._core().public_config()

    @classmethod
    def logout_url(
        cls,
        *,
        id_token_hint: str | None = None,
        post_logout_redirect_uri: str | None = None,
    ) -> str | None:
        return cls._core().logout_url(
            id_token_hint=id_token_hint,
            post_logout_redirect_uri=post_logout_redirect_uri,
        )

    @classmethod
    def _issuer_candidates(cls) -> list[str]:
        return cls._core()._issuer_candidates()

    @classmethod
    def clear_jwks_cache(cls) -> None:
        OidcCore.clear_jwks_cache()

    # ─── instance delegates ───────────────────────────────────────────────

    async def exchange_code(
        self,
        *,
        code: str,
        code_verifier: str,
        redirect_uri: str,
    ) -> dict[str, Any]:
        return await self._oidc_core.exchange_code(
            code=code,
            code_verifier=code_verifier,
            redirect_uri=redirect_uri,
        )

    async def fetch_jwks(self) -> dict[str, Any]:
        return await self._oidc_core.fetch_jwks()

    async def validate_id_token(self, id_token: str) -> OidcClaims:
        return await self._oidc_core.validate_id_token(id_token)

    async def validate_logout_token(self, logout_token: str) -> LogoutClaims:
        return await self._oidc_core.validate_logout_token(logout_token)

    # ─── hooks (host domain, wired into the shared core) ──────────────────

    async def _issue_token(
        self,
        user: User,
        claims: OidcClaims,
        *,
        ip: str | None,
        user_agent: str | None,
    ) -> str:
        token, _session = await session_service.complete_login(
            self.db,
            user=user,
            login_method="oidc",
            ip=ip,
            user_agent=user_agent,
            oidc_sid=claims.sid,
        )
        return token

    async def _record_failed_login(
        self,
        *,
        reason: str,
        username_attempted: str | None,
        ip: str | None,
        user_agent: str | None,
    ) -> None:
        try:
            await session_service.record_failed_login(
                self.db,
                username_attempted=username_attempted,
                reason=reason,
                method="oidc",
                ip=ip,
                user_agent=user_agent,
            )
        except Exception:  # noqa: BLE001 — audit must never break auth flow
            logger.warning("OIDC failed-login audit record failed", exc_info=True)

    # ─── user resolve / link ──────────────────────────────────────────────

    async def resolve_or_provision_user(self, claims: OidcClaims) -> User:
        """
        Link order:
        1. by authentik_sub
        2. by preferred_username / email as local username
        3. if AUTH_OIDC_ALLOW_JIT: create
        4. else 403 oidc_user_not_linked
        """
        user = await self.users.get_by_authentik_sub(self.db, claims.sub)
        if user is not None:
            await self._sync_role_from_idp(user, claims)
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
                await self._sync_role_from_idp(found, claims)
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
        """JIT create role: fail-closed — only admin/viewer accepted from IdP claim."""
        level = _hrms_role_from_claims(claims)
        if level in ("admin", "viewer"):
            return level
        # fail-closed: no default role for JIT
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="no_access",
        )

    async def _sync_role_from_idp(self, user: User, claims: OidcClaims) -> None:
        """Unconditional fail-closed role sync from IdP claim hrms_role."""
        hrms_role = _hrms_role_from_claims(claims)

        if hrms_role in ("admin", "viewer"):
            user.role = hrms_role
            user.is_active = True
            self.db.add(user)
            await self.db.flush()
            await self.db.refresh(user)
        elif hrms_role == "conflict":
            # Ошибка данных в IdP — логировать, отказать
            logger.warning(
                "OIDC role conflict for user %s (sub=%s)", user.username, claims.sub
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="role_conflict",
            )
        else:
            # no_access или отсутствует — fail-closed
            user.is_active = False
            self.db.add(user)
            await self.db.flush()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="no_access",
            )

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
        result = await self._oidc_core.handle_callback(
            code=code,
            code_verifier=code_verifier,
            redirect_uri=redirect_uri,
            ip=ip,
            user_agent=user_agent,
        )
        user = result["user"]
        return {
            "access_token": result["access_token"],
            "token_type": result["token_type"],
            "username": user.username,
            "role": user.role,
            "full_name": user.full_name or user.username,
            # For Authentik RP-initiated logout (id_token_hint + post_logout_redirect_uri)
            "id_token": result["id_token"],
        }
