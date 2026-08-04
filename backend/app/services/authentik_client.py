"""
Authentik Admin API client — общий модуль сети к IdP (канон).

Используется unified_profile_service.py и (через обёртку) authentik_admin_service.py.
Копируется между приложениями семейства (HRMS, KTM) без правок.

Охватывает: резолв origin Admin API, заголовки с Bearer-токеном, единый
async httpx-клиент и нормализованную обработку ошибок. Токен живёт только
в настройках бэкенда (AUTHENTIK_API_TOKEN).

Authentik 2024+/2026.x endpoints used:
- GET  /api/v3/core/users/
- GET  /api/v3/core/users/{pk}/
- PATCH /api/v3/core/users/{pk}/
"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.core.host_net import resolve_authentik_origin


class AuthentikAdminError(Exception):
    """Upstream IdP / configuration error for admin proxy."""

    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def resolved_authentik_api_origin() -> str | None:
    """Admin API base origin — explicit URL or auto LAN IP (no hardcoded host)."""
    return resolve_authentik_origin(
        settings.AUTHENTIK_API_URL,
        fallback_issuer=settings.AUTH_OIDC_ISSUER,
    )


def public_base_url() -> str | None:
    """Public Authentik origin for deep-links (no trailing slash).

    ``auto`` / empty → detect host LAN IP (or HOST_LAN_IP env). Never hardcode office IP.
    """
    origin = resolve_authentik_origin(
        settings.AUTHENTIK_PUBLIC_URL,
        fallback_issuer=settings.AUTH_OIDC_ISSUER,
    )
    if origin:
        return origin
    return resolve_authentik_origin(
        settings.AUTHENTIK_API_URL,
        fallback_issuer=settings.AUTH_OIDC_ISSUER,
    )


def is_idp_admin_enabled() -> bool:
    """OIDC on + resolvable API origin + non-empty token."""
    if not settings.AUTH_OIDC_ENABLED:
        return False
    url = resolved_authentik_api_origin()
    token = (settings.AUTHENTIK_API_TOKEN or "").strip()
    return bool(url and token)


def _api_base() -> str:
    raw = resolved_authentik_api_origin()
    if not raw:
        raise AuthentikAdminError(
            "AUTHENTIK_API_URL is not configured and LAN IP could not be detected",
            status_code=503,
        )
    raw = raw.rstrip("/")
    if raw.endswith("/api/v3"):
        return raw
    return f"{raw}/api/v3"


def _headers() -> dict[str, str]:
    token = (settings.AUTHENTIK_API_TOKEN or "").strip()
    if not token:
        raise AuthentikAdminError("AUTHENTIK_API_TOKEN is not configured", status_code=503)
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


async def _request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> Any:
    base = _api_base()
    url = f"{base}{path}" if path.startswith("/") else f"{base}/{path}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.request(
                method,
                url,
                headers=_headers(),
                params=params,
                json=json_body,
            )
    except httpx.HTTPError as exc:
        raise AuthentikAdminError(f"Authentik unreachable: {exc}", status_code=502) from exc

    if resp.status_code >= 400:
        detail = resp.text[:500] if resp.text else resp.reason_phrase
        # Pass through client errors (e.g. email uniqueness 400) for profile writes
        code = resp.status_code if 400 <= resp.status_code < 500 else 502
        raise AuthentikAdminError(
            f"Authentik API error {resp.status_code}: {detail}",
            status_code=code,
        )
    if resp.status_code == 204 or not resp.content:
        return None
    try:
        return resp.json()
    except ValueError as exc:
        raise AuthentikAdminError("Invalid JSON from Authentik", status_code=502) from exc
