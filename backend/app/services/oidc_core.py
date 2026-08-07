"""Shared OIDC core: protocol-level OIDC / Authentik bridge (no host domain).

must-match module across HRMS/KTM (gate: scripts/sync-manifest.json +
scripts/verify-sync.mjs). Keep this file byte-identical in both repos.

The core knows nothing about User / roles / sessions: it accepts
:class:`OidcCoreConfig` (protocol knobs) and :class:`OidcHooks`
(resolve_or_provision / issue_token / record_failed_login) and wires the
authorization-code + PKCE flow:

  exchange_code → validate_id_token (JWKS + TTL cache) → hooks

Host adapters (backend/app/services/oidc_auth_service.py) wire their own
domain — role-mapping, user-provisioning, session issuance via the shared
session-core, RU error dictionary — through the hooks and keep the public
service API surface.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable
from urllib.parse import urlencode, urljoin, urlparse, urlunparse

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt
from jose.backends import RSAKey

assert RSAKey is not None  # cryptography backend (jose types RSAKey as Optional)

logger = logging.getLogger(__name__)

# const OIDC_CORE_VERSION = "1.0.0"
# The line above is the version source for scripts/verify-sync.mjs
# (its *_VERSION regex requires the literal "const " prefix).
OIDC_CORE_VERSION = "1.0.0"

_BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout"
_FIXED_ALT_HOSTS = ("localhost", "127.0.0.1", "host.docker.internal")

# In-process JWKS cache: {url: (fetched_at_monotonic, jwks_dict)}
_JWKS_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_JWKS_TTL_SECONDS = 3600


@dataclass(frozen=True)
class OidcCoreConfig:
    """Protocol knobs for the shared OIDC core (no host domain)."""

    enabled: bool
    issuer: str | None
    client_id: str | None
    client_secret: str | None
    redirect_uri: str | None
    scopes: str
    issuer_aliases: str | None
    authorization_url: str | None
    token_url: str | None
    jwks_url: str | None
    end_session_url: str | None
    auto_issuer_client_id: str
    resolve_auto_origin: Callable[[], str | None] | None = None
    extra_alt_hosts: tuple[str, ...] = ()
    login_hint_enabled: bool = False
    sso_only: bool = False


@dataclass(frozen=True)
class OidcClaims:
    """Normalized claims extracted from a validated id_token.

    Host-specific role claims (ktm_role / hrms_role) stay in ``raw`` —
    the core never maps them.
    """

    sub: str
    preferred_username: str | None
    email: str | None
    name: str | None
    groups: tuple[str, ...] = ()
    # OIDC session id — back-channel logout correlation
    sid: str | None = None
    # Full validated claims dict — host role-mapping source
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class LogoutClaims:
    """Normalized claims from a validated OIDC back-channel logout_token."""

    sub: str
    sid: str | None = None
    jti: str | None = None
    iss: str | None = None
    # exp (unix ts) — TTL for jti replay-store row
    exp: int | None = None


@dataclass
class OidcHooks:
    """Host-wired domain callbacks (core never touches User/roles/session)."""

    # (claims) -> host user object; raise HTTPException on link failure
    resolve_or_provision: Callable[..., Awaitable[Any]] | None = None
    # (user, claims, *, ip, user_agent) -> app access_token string
    issue_token: Callable[..., Awaitable[str]] | None = None
    # (*, reason, username_attempted, ip, user_agent) -> audit row
    record_failed_login: Callable[..., Awaitable[Any]] | None = None


class OidcCore:
    """Protocol-level OIDC flow: exchange_code + JWKS verification + hooks."""

    def __init__(self, config: OidcCoreConfig, hooks: OidcHooks | None = None) -> None:
        self.config = config
        self.hooks = hooks or OidcHooks()

    # ─── config helpers ───────────────────────────────────────────────────

    def is_enabled(self) -> bool:
        return bool(self.config.enabled)

    def _issuer(self) -> str:
        issuer = (self.config.issuer or "").strip()
        if not issuer or issuer.lower() == "auto":
            origin: str | None = None
            if self.config.resolve_auto_origin is not None:
                try:
                    origin = self.config.resolve_auto_origin()
                except Exception:  # noqa: BLE001
                    origin = None
            origin = origin or "http://localhost:9000"
            client_id = self.config.client_id or self.config.auto_issuer_client_id
            issuer = f"{origin}/application/o/{client_id}/"
        return issuer if issuer.endswith("/") else issuer + "/"

    def _alt_issuer_hosts(self) -> list[str]:
        """Hostnames that may appear in id_token.iss (LAN IP, localhost, docker)."""
        hosts: list[str] = []
        seen: set[str] = set()

        def add_host(h: str | None) -> None:
            if not h:
                return
            h = h.strip().lower().split("%")[0]
            if not h or h in seen:
                return
            seen.add(h)
            hosts.append(h)

        for fixed in _FIXED_ALT_HOSTS:
            add_host(fixed)

        for extra in self.config.extra_alt_hosts:
            add_host(extra)

        raw_issuer = (self.config.issuer or "").strip()
        if raw_issuer:
            parsed = urlparse(raw_issuer if "://" in raw_issuer else f"http://{raw_issuer}")
            add_host(parsed.hostname)

        aliases = (self.config.issuer_aliases or "").strip()
        for part in aliases.split(","):
            part = part.strip()
            if not part:
                continue
            if "://" in part:
                add_host(urlparse(part).hostname)
            else:
                # host or host:port
                add_host(part.split("/")[0].split(":")[0])

        return hosts

    def _issuer_candidates(self) -> list[str]:
        """Accept iss from browser host, LAN IP, Docker host-gateway, and aliases.

        Authentik sets id_token ``iss`` from the authorize request Host.
        SPA may open IdP as localhost:9000 or http://<LAN-IP>:9000 — both valid.
        """
        primary = self._issuer()
        bare = primary.rstrip("/")
        out: list[str] = []
        seen: set[str] = set()

        def add(value: str) -> None:
            if value and value not in seen:
                seen.add(value)
                out.append(value)

        add(primary)
        add(bare)

        for base in (primary, bare):
            parsed = urlparse(base if "://" in base else f"http://{base}")
            if not parsed.hostname:
                continue
            path = parsed.path or ""
            for host in self._alt_issuer_hosts():
                port = parsed.port
                netloc = f"{host}:{port}" if port else host
                rebuilt = urlunparse(
                    (parsed.scheme or "http", netloc, path, "", "", "")
                )
                add(rebuilt)
                add(rebuilt.rstrip("/"))
                if not rebuilt.endswith("/"):
                    add(rebuilt + "/")
        return out

    def resolve_authorization_url(self) -> str:
        if self.config.authorization_url:
            return self.config.authorization_url.rstrip("/")
        issuer = self._issuer()
        # issuer = …/application/o/{client}/ → …/application/o/authorize/
        base = issuer.rsplit("/", 2)[0] + "/"
        return urljoin(base, "authorize/")

    def resolve_token_url(self) -> str:
        if self.config.token_url:
            return self.config.token_url
        issuer = self._issuer()
        base = issuer.rsplit("/", 2)[0] + "/"
        return urljoin(base, "token/")

    def resolve_jwks_url(self) -> str:
        if self.config.jwks_url:
            return self.config.jwks_url
        return urljoin(self._issuer(), "jwks/")

    def resolve_end_session_url(self) -> str:
        if self.config.end_session_url:
            return self.config.end_session_url
        return urljoin(self._issuer(), "end-session/")

    def public_config(self) -> dict[str, Any]:
        """Payload for GET /auth/oidc/config (no secrets)."""
        if not self.is_enabled():
            return {
                "enabled": False,
                "authorization_url": None,
                "client_id": None,
                "redirect_uri": None,
                "scopes": None,
                "issuer": None,
                "token_url": None,
                "login_hint_enabled": self.config.login_hint_enabled,
                "sso_only": self.config.sso_only,
            }
        try:
            auth_url = self.resolve_authorization_url()
            token_url = self.resolve_token_url()
            issuer = self._issuer()
        except HTTPException:
            return {
                "enabled": True,
                "authorization_url": None,
                "client_id": self.config.client_id,
                "redirect_uri": self.config.redirect_uri,
                "scopes": self.config.scopes,
                "issuer": self.config.issuer,
                "token_url": self.config.token_url,
                "login_hint_enabled": self.config.login_hint_enabled,
                "sso_only": self.config.sso_only,
            }
        return {
            "enabled": True,
            "authorization_url": auth_url,
            "client_id": self.config.client_id,
            "redirect_uri": self.config.redirect_uri,
            "scopes": self.config.scopes,
            "issuer": issuer.rstrip("/"),
            "token_url": token_url,
            "login_hint_enabled": self.config.login_hint_enabled,
            "sso_only": self.config.sso_only,
        }

    def logout_url(
        self,
        *,
        id_token_hint: str | None = None,
        post_logout_redirect_uri: str | None = None,
    ) -> str | None:
        """Build Authentik RP-initiated logout URL.

        Authentik requires ``id_token_hint`` when ``post_logout_redirect_uri`` is
        used and the provider has registered logout redirect URIs. Sending
        post_logout alone yields 400 «The request is otherwise malformed».
        """
        if not self.is_enabled():
            return None
        try:
            base = self.resolve_end_session_url()
        except HTTPException:
            return None

        # Handle FastAPI Query defaults if called directly in unit tests
        if id_token_hint is not None and not isinstance(id_token_hint, str):
            id_token_hint = None
        if post_logout_redirect_uri is not None and not isinstance(post_logout_redirect_uri, str):
            post_logout_redirect_uri = None

        params: dict[str, str] = {}
        hint = (id_token_hint or "").strip()
        if hint:
            params["id_token_hint"] = hint
            if post_logout_redirect_uri:
                params["post_logout_redirect_uri"] = post_logout_redirect_uri
            elif self.config.redirect_uri:
                redirect = self.config.redirect_uri
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
        client_id = self.config.client_id
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
        secret = (self.config.client_secret or "").strip()
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

    @staticmethod
    def _matching_jwks_key(
        jwks: dict[str, Any], kid: str | None
    ) -> dict[str, Any] | None:
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
        return matching

    async def validate_id_token(self, id_token: str) -> OidcClaims:
        """Verify signature (JWKS), iss, aud, exp; return normalized claims."""
        client_id = self.config.client_id
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
        matching = self._matching_jwks_key(await self.fetch_jwks(), kid)
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

        for issuer_candidate in self._issuer_candidates():
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

        raw_groups = claims.get("groups") or claims.get("groups_list") or []
        groups: tuple[str, ...] = ()
        if isinstance(raw_groups, (list, tuple)):
            groups = tuple(str(g) for g in raw_groups if g)

        sid_raw = claims.get("sid")
        sid = sid_raw if isinstance(sid_raw, str) and sid_raw else None

        return OidcClaims(
            sub=sub,
            preferred_username=claims.get("preferred_username") or claims.get("nickname"),
            email=claims.get("email"),
            name=claims.get("name"),
            groups=groups,
            sid=sid,
            raw=dict(claims),
        )

    async def validate_logout_token(self, logout_token: str) -> LogoutClaims:
        """Verify OIDC back-channel logout_token (JWKS, iss, aud, events, sub).

        Spec: invalid → 400. Does not match IdP ``sid`` to app session ids.
        """
        token = (logout_token or "").strip()
        if not token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_logout_token",
            )

        client_id = self.config.client_id
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OIDC client_id not configured",
            )

        try:
            header = jwt.get_unverified_header(token)
        except JWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_logout_token",
            ) from exc

        alg = header.get("alg") or "RS256"
        if not isinstance(alg, str) or alg.lower() == "none":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_logout_token",
            )
        if alg != "RS256":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_logout_token",
            )

        kid = header.get("kid")
        matching = self._matching_jwks_key(await self.fetch_jwks(), kid)
        if matching is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_logout_token",
            )

        claims: dict[str, Any] | None = None
        last_err: Exception | None = None
        try:
            rsa_key = RSAKey(matching, algorithm="RS256")
        except Exception as exc:  # noqa: BLE001
            logger.info("OIDC logout_token JWKS key load failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_logout_token",
            ) from exc

        for issuer_candidate in self._issuer_candidates():
            try:
                claims = jwt.decode(
                    token,
                    rsa_key,
                    algorithms=["RS256"],
                    audience=client_id,
                    issuer=issuer_candidate,
                    options={
                        "verify_at_hash": False,
                        "require_exp": True,
                        "require_iat": True,
                        "require_nbf": False,
                    },
                )
                break
            except JWTError as exc:
                last_err = exc
                continue

        if claims is None:
            logger.info("OIDC logout_token validation failed: %s", last_err)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_logout_token",
            )

        if "nonce" in claims:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_logout_token",
            )

        events = claims.get("events")
        if not isinstance(events, dict) or _BACKCHANNEL_LOGOUT_EVENT not in events:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_logout_token",
            )

        sub = claims.get("sub")
        if not sub or not isinstance(sub, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_logout_token",
            )

        sid_raw = claims.get("sid")
        sid = sid_raw if isinstance(sid_raw, str) and sid_raw else None
        jti_raw = claims.get("jti")
        jti = jti_raw if isinstance(jti_raw, str) and jti_raw else None
        iss_raw = claims.get("iss")
        iss = iss_raw if isinstance(iss_raw, str) else None
        exp_raw = claims.get("exp")
        exp = exp_raw if isinstance(exp_raw, int) and not isinstance(exp_raw, bool) else None

        return LogoutClaims(sub=sub, sid=sid, jti=jti, iss=iss, exp=exp)

    # ─── full callback orchestration ──────────────────────────────────────

    async def _record_failed(
        self,
        *,
        reason: str,
        username_attempted: str | None,
        ip: str | None,
        user_agent: str | None,
    ) -> None:
        hook = self.hooks.record_failed_login
        if hook is None:
            return
        try:
            await hook(
                reason=reason,
                username_attempted=username_attempted,
                ip=ip,
                user_agent=user_agent,
            )
        except Exception:  # noqa: BLE001 — audit must never break auth flow
            logger.exception("OIDC failed-login audit hook error")

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
        Exchange code → validate id_token → hooks.resolve_or_provision →
        hooks.issue_token. Returns host-neutral result dict.
        """
        if not self.is_enabled():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="OIDC login disabled",
            )

        redir = (redirect_uri or self.config.redirect_uri or "").strip()
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
            await self._record_failed(
                reason="invalid_id_token",
                username_attempted=None,
                ip=ip,
                user_agent=user_agent,
            )
            raise exc

        resolve_or_provision = self.hooks.resolve_or_provision
        issue_token = self.hooks.issue_token
        if resolve_or_provision is None or issue_token is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="OIDC hooks not configured",
            )

        try:
            user = await resolve_or_provision(claims)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                reason = exc.detail if isinstance(exc.detail, str) else "oidc_user_not_linked"
                await self._record_failed(
                    reason=reason,
                    username_attempted=claims.preferred_username or claims.email or claims.sub,
                    ip=ip,
                    user_agent=user_agent,
                )
            raise

        token = await issue_token(
            user,
            claims,
            ip=ip,
            user_agent=user_agent,
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "id_token": id_token,
            "user": user,
            "claims": claims,
        }
