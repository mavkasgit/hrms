"""Extract client IP from ASGI/Starlette request, respecting trusted proxies."""

from __future__ import annotations

from typing import Mapping


def get_client_ip_from_headers(
    headers: Mapping[str, str],
    *,
    client_host: str | None = None,
    trusted_proxy_count: int = 1,
) -> str | None:
    """
    Pure header/host resolution (unit-testable without Starlette Request).

    Prefer X-Real-IP if present (nginx sets it).
    Else peel X-Forwarded-For from the right by trusted_proxy_count.
    Else client_host (request.client.host).
    """
    # Headers may be case-insensitive mapping (Starlette Headers) or plain dict
    def _get(name: str) -> str | None:
        if hasattr(headers, "get"):
            # try common casings
            for key in (name, name.lower(), name.title()):
                val = headers.get(key)
                if val:
                    return str(val).strip() or None
        return None

    real_ip = _get("X-Real-IP")
    if real_ip:
        # X-Real-IP is typically a single address
        return real_ip.split(",")[0].strip() or None

    xff = _get("X-Forwarded-For")
    if xff:
        # left-most = original client; proxies append to the right
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            count = max(int(trusted_proxy_count), 0)
            if count <= 0:
                return parts[0]
            # peel `count` proxies from the right; take remaining rightmost as client
            # e.g. [client, p1, p2] with count=1 → client is parts[-2]; count=2 → parts[-3]
            idx = len(parts) - 1 - count
            if idx < 0:
                idx = 0
            return parts[idx]

    if client_host:
        host = client_host.strip()
        return host or None
    return None


def get_client_ip(request, trusted_proxy_count: int = 1) -> str | None:
    """
    Prefer X-Real-IP if present (nginx sets it).
    Else peel X-Forwarded-For from the right by trusted_proxy_count.
    Else request.client.host.
    """
    client_host = None
    if getattr(request, "client", None) is not None:
        client_host = getattr(request.client, "host", None)

    headers = getattr(request, "headers", {}) or {}
    return get_client_ip_from_headers(
        headers,
        client_host=client_host,
        trusted_proxy_count=trusted_proxy_count,
    )
