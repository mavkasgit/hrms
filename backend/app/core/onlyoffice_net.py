"""Единый владелец URL/token/origin-логики OnlyOffice (issue #115).

Контракт origin-хелперов (request_origin / external_origin_from_headers):
применяются при формировании callback/file URL и documentServerUrl для
OnlyOffice. Если хост запроса приватный/loopback (dev или локальная сеть),
берём внешний origin из заголовков Origin/Referer — OnlyOffice-контейнер
должен дотянуться до бэкенда по адресу, видимому из его сети; иначе origin
строится как proto://host с учётом x-forwarded-proto/x-forwarded-host/cf-visitor.

Тела функций — каноническая (новая) версия из app/api/documents.py;
роутеры импортируют их с алиасами `_имя`, сохраняющими call sites.
"""

import ipaddress
import json
from typing import Any
from urllib.parse import urlparse

from fastapi import Request

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.services.onlyoffice_service import onlyoffice_service


def public_api_url(path: str) -> str:
    # BACKEND_INTERNAL_CALLBACK_URL is backend base URL reachable by ONLYOFFICE.
    # APP_PUBLIC_URL remains as backward-compatible fallback.
    # Add /api prefix for backend routes.
    base_url = (settings.BACKEND_INTERNAL_CALLBACK_URL or settings.APP_PUBLIC_URL).rstrip("/")
    return f"{base_url}/api{path}"


def is_private_or_loopback_host(hostname: str | None) -> bool:
    if not hostname:
        return False
    if hostname in {"localhost", "127.0.0.1", "::1"}:
        return True
    try:
        addr = ipaddress.ip_address(hostname.strip("[]"))
    except ValueError:
        return False
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_unspecified
    )


def request_origin(request: Request) -> str:
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    cf_visitor_raw = request.headers.get("cf-visitor")
    if cf_visitor_raw:
        try:
            cf_scheme = json.loads(cf_visitor_raw).get("scheme")
            if cf_scheme in {"http", "https"}:
                proto = cf_scheme
        except Exception:
            pass
    if not proto:
        proto = request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    host_only = (host or "").split(":")[0]
    if is_private_or_loopback_host(host_only):
        external_origin = external_origin_from_headers(request)
        if external_origin:
            return external_origin
    return f"{proto}://{host}".rstrip("/")


def external_origin_from_headers(request: Request) -> str | None:
    for raw in (request.headers.get("origin"), request.headers.get("referer")):
        if not raw:
            continue
        try:
            parsed = urlparse(raw)
        except Exception:
            continue
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue
        if parsed.hostname and not is_private_or_loopback_host(parsed.hostname):
            return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    return None


def document_server_url(request: Request) -> str:
    # ========================================================================
    # ARCHITECTURE REFERENCE: How OnlyOffice URLs work
    # ========================================================================
    #
    # DEV MODE (docker compose up for postgres + onlyoffice, local backend/frontend):
    #   - Frontend: Vite dev server on localhost:5171
    #   - Backend:  uvicorn on localhost:8000
    #   - OnlyOffice: Docker container on localhost:8085
    #   - No nginx proxy in dev
    #   - Browser needs direct access to OnlyOffice at http://localhost:8085
    #   - Solution: use ONLYOFFICE_PUBLIC_URL from .env.dev (http://localhost:8085)
    #
    # DOCKER / PROD MODE (full docker compose with all services):
    #   - All containers share the same Docker network (hrms_default)
    #   - nginx listens on :80 and proxies:
    #       /api/        -> backend:8000
    #       /web-apps/   -> onlyoffice:80  (internal Docker DNS)
    #   - Frontend container serves static files through nginx
    #   - Browser makes ALL requests to one origin (e.g. http://server:80)
    #   - /web-apps/... reaches OnlyOffice via nginx proxy to onlyoffice:80
    #   - Request origin (http://server:80) IS the correct documentServerUrl
    #   - .env.prod sets ONLYOFFICE_PUBLIC_URL=${PUBLIC_URL}/onlyoffice
    #     but since this is the same as request origin, the fallback works
    #
    # KEY INSIGHT:
    #   In dev the backend returns http://localhost:8085 (OnlyOffice container direct)
    #   In prod the backend returns http://server:80 (nginx origin, which proxies to OnlyOffice)
    #   The ONLYOFFICE_PUBLIC_URL check handles dev; the fallback handles prod.
    # ========================================================================
    if settings.ONLYOFFICE_PUBLIC_URL:
        return settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
    return request_origin(request)


def extract_callback_token(request: Request, body: dict[str, Any]) -> str | None:
    token = body.get("token")
    if token:
        return str(token)
    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip()


def assert_valid_callback_token(request: Request, body: dict[str, Any]) -> None:
    token = extract_callback_token(request, body)
    if not token or not onlyoffice_service.validate_callback_token(token):
        raise HRMSException("Невалидный JWT OnlyOffice", "invalid_onlyoffice_jwt", status_code=403)
