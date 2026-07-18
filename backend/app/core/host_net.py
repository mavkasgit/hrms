"""Detect host LAN IP and resolve browser/API base URLs (no hardcoded office IP).

Same rules as authentik/ops/idp_ops/public_url.py and scripts/detect_public_url.py:

  1. Explicit env URL (not empty / auto / detect)
  2. OPS_PUBLIC_IP / OPS_HOST_LAN_IP / HOST_LAN_IP / SERVER_IP
  3. Auto-detect primary non-loopback IPv4 (default route)
  4. None if nothing found

Use AUTHENTIK_API_URL=auto and AUTHENTIK_PUBLIC_URL=auto in .env.
"""

from __future__ import annotations

import os
import re
import socket
from functools import lru_cache
from urllib.parse import urlparse

_AUTO_MARKERS = frozenset({"", "auto", "detect", "0", "false", "none"})


def is_auto_url(raw: str | None) -> bool:
    if raw is None:
        return True
    return raw.strip().lower() in _AUTO_MARKERS


def normalize_explicit_url(raw: str | None) -> str | None:
    """Return absolute URL without trailing slash, or None if auto/empty."""
    if raw is None:
        return None
    s = raw.strip().rstrip("/")
    if not s or s.lower() in _AUTO_MARKERS:
        return None
    if "://" not in s:
        s = "http://" + s
    return s.rstrip("/")


def env_lan_ip() -> str | None:
    for key in ("OPS_PUBLIC_IP", "OPS_HOST_LAN_IP", "HOST_LAN_IP", "SERVER_IP"):
        ip = (os.environ.get(key) or "").strip()
        if ip and re.match(r"^\d{1,3}(\.\d{1,3}){3}$", ip) and not ip.startswith("127."):
            return ip
    return None


@lru_cache(maxsize=1)
def detect_lan_ip() -> str | None:
    """Best-effort primary LAN IPv4 of this host."""
    candidates: list[str] = []

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("1.1.1.1", 53))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            candidates.append(ip)
    except OSError:
        pass

    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in candidates:
                candidates.append(ip)
    except OSError:
        pass

    try:
        for info in socket.getaddrinfo(None, 0, socket.AF_INET, socket.SOCK_DGRAM):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in candidates:
                candidates.append(ip)
    except OSError:
        pass

    if not candidates:
        return None

    def score(ip: str) -> tuple[int, str]:
        parts = ip.split(".")
        try:
            a, b = int(parts[0]), int(parts[1])
        except (ValueError, IndexError):
            return (50, ip)
        if a == 192 and b == 168:
            return (0, ip)
        if a == 10:
            return (1, ip)
        if a == 172 and 16 <= b <= 31:
            return (2, ip)
        if a == 169 and b == 254:
            return (90, ip)
        return (10, ip)

    candidates.sort(key=score)
    return candidates[0]


def authentik_http_port() -> int:
    """Port for Authentik HTTP (default 9000), overridable via env."""
    for key in ("AUTHENTIK_HTTP_PORT", "OPS_AUTHENTIK_PUBLIC_PORT", "COMPOSE_PORT_HTTP"):
        raw = (os.environ.get(key) or "").strip()
        if raw:
            try:
                return int(raw)
            except ValueError:
                pass
    return 9000


def origin_from_host(host: str, *, port: int | None = None, scheme: str = "http") -> str:
    p = authentik_http_port() if port is None else port
    scheme = (scheme or "http").lower()
    if scheme not in ("http", "https"):
        scheme = "http"
    if (scheme == "http" and p == 80) or (scheme == "https" and p == 443):
        return f"{scheme}://{host}"
    return f"{scheme}://{host}:{p}"


def resolve_authentik_origin(
    configured: str | None = None,
    *,
    fallback_issuer: str | None = None,
) -> str | None:
    """
    Resolve Authentik browser/API origin (no path, no trailing slash).

    Priority:
      1. configured URL if not auto
      2. HOST_LAN_IP family env
      3. detect_lan_ip()
      4. hostname from fallback_issuer if non-loopback
    """
    explicit = normalize_explicit_url(configured)
    if explicit:
        # If someone passed full issuer path, strip to origin
        p = urlparse(explicit)
        if p.scheme and p.netloc:
            return f"{p.scheme}://{p.netloc}"
        return explicit

    ip = env_lan_ip() or detect_lan_ip()
    if ip:
        return origin_from_host(ip)

    if fallback_issuer:
        try:
            p = urlparse(fallback_issuer.strip())
            host = (p.hostname or "").strip()
            if host and host not in ("localhost", "127.0.0.1", "::1") and not host.startswith("127."):
                port = p.port or authentik_http_port()
                return origin_from_host(host, port=port, scheme=p.scheme or "http")
        except Exception:
            pass

    return None
