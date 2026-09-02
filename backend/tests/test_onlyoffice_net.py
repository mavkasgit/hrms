"""Юнит-тесты app.core.onlyoffice_net (issue #115): URL/token/origin-хелперы.

Serial-тесты без БД и launcher: Request строится из scope-словаря starlette,
настройки монкипатчатся на объекте app.core.config.settings (как принято
в test_onlyoffice.py).
"""

from __future__ import annotations

import pytest
from fastapi import Request
from jose import jwt

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.core.onlyoffice_net import (
    assert_valid_callback_token,
    document_server_url,
    extract_callback_token,
    external_origin_from_headers,
    is_private_or_loopback_host,
    public_api_url,
    request_origin,
)


def make_request(
    headers: dict[str, str] | None = None,
    *,
    host: str = "192.168.100.200",
    port: int = 8000,
    scheme: str = "http",
) -> Request:
    raw_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    scope = {
        "type": "http",
        "method": "GET",
        "scheme": scheme,
        "server": (host, port),
        "path": "/api/test",
        "query_string": b"",
        "headers": raw_headers,
    }
    return Request(scope)


# ─── public_api_url ──────────────────────────────────────────────────────────


def test_public_api_url_uses_backend_internal_callback_url(monkeypatch):
    monkeypatch.setattr(settings, "BACKEND_INTERNAL_CALLBACK_URL", "http://backend:8000")
    monkeypatch.setattr(settings, "APP_PUBLIC_URL", "http://app:9000")

    assert public_api_url("/orders/1/onlyoffice/callback") == "http://backend:8000/api/orders/1/onlyoffice/callback"


def test_public_api_url_falls_back_to_app_public_url(monkeypatch):
    monkeypatch.setattr(settings, "BACKEND_INTERNAL_CALLBACK_URL", "")
    monkeypatch.setattr(settings, "APP_PUBLIC_URL", "http://app:9000")

    assert public_api_url("/orders/1/file") == "http://app:9000/api/orders/1/file"


def test_public_api_url_strips_trailing_slash_and_adds_api_prefix(monkeypatch):
    monkeypatch.setattr(settings, "BACKEND_INTERNAL_CALLBACK_URL", "http://backend:8000/")

    assert public_api_url("/orders/1/file") == "http://backend:8000/api/orders/1/file"


# ─── is_private_or_loopback_host ─────────────────────────────────────────────


@pytest.mark.parametrize(
    "hostname",
    ["localhost", "127.0.0.1", "::1", "[::1]", "192.168.1.5", "10.0.0.2", "172.16.0.1", "169.254.1.1"],
)
def test_is_private_or_loopback_host_true(hostname):
    assert is_private_or_loopback_host(hostname) is True


@pytest.mark.parametrize("hostname", ["8.8.8.8", "example.com", "hrms.office.local", None, ""])
def test_is_private_or_loopback_host_false(hostname):
    assert is_private_or_loopback_host(hostname) is False


# ─── request_origin ──────────────────────────────────────────────────────────


def test_request_origin_plain_host():
    request = make_request({"host": "hrms.example.com"})

    assert request_origin(request) == "http://hrms.example.com"


def test_request_origin_x_forwarded_proto_and_host():
    request = make_request(
        {
            "x-forwarded-proto": "https",
            "x-forwarded-host": "hrms.example.com",
            "host": "internal:8000",
        }
    )

    assert request_origin(request) == "https://hrms.example.com"


def test_request_origin_cf_visitor_scheme():
    request = make_request({"host": "hrms.example.com", "cf-visitor": '{"scheme":"https"}'})

    assert request_origin(request) == "https://hrms.example.com"


def test_request_origin_private_host_with_external_origin():
    request = make_request(
        {"host": "192.168.100.200:8000", "origin": "https://portal.example.com"}
    )

    assert request_origin(request) == "https://portal.example.com"


def test_request_origin_private_host_without_external_headers_falls_back_to_request_origin():
    request = make_request({"host": "192.168.100.200:8000"})

    assert request_origin(request) == "http://192.168.100.200:8000"


# ─── external_origin_from_headers ────────────────────────────────────────────


def test_external_origin_from_headers_public_origin():
    request = make_request({"origin": "https://portal.example.com"})

    assert external_origin_from_headers(request) == "https://portal.example.com"


def test_external_origin_from_headers_private_origin_public_referer():
    request = make_request(
        {
            "origin": "http://192.168.100.200:5171",
            "referer": "https://portal.example.com/orders/1",
        }
    )

    assert external_origin_from_headers(request) == "https://portal.example.com"


def test_external_origin_from_headers_unparsable_returns_none():
    request = make_request({"origin": "::::"})

    assert external_origin_from_headers(request) is None


def test_external_origin_from_headers_no_headers_returns_none():
    assert external_origin_from_headers(make_request()) is None


# ─── document_server_url ─────────────────────────────────────────────────────


def test_document_server_url_uses_onlyoffice_public_url(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_PUBLIC_URL", "http://localhost:8085/")

    assert document_server_url(make_request()) == "http://localhost:8085"


def test_document_server_url_falls_back_to_request_origin(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_PUBLIC_URL", "")

    assert document_server_url(make_request({"host": "server:80"})) == "http://server:80"


# ─── extract_callback_token ──────────────────────────────────────────────────


def test_extract_callback_token_from_body():
    assert extract_callback_token(make_request(), {"token": "abc"}) == "abc"


def test_extract_callback_token_from_authorization_bearer():
    request = make_request({"authorization": "Bearer xyz"})

    assert extract_callback_token(request, {}) == "xyz"


def test_extract_callback_token_missing_returns_none():
    assert extract_callback_token(make_request(), {}) is None


# ─── assert_valid_callback_token ─────────────────────────────────────────────


def test_assert_valid_callback_token_accepts_valid_jwt(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    token = jwt.encode({"status": 2}, "test-secret", algorithm="HS256")

    assert_valid_callback_token(make_request(), {"token": token})


def test_assert_valid_callback_token_rejects_invalid_jwt(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")

    with pytest.raises(HRMSException) as exc_info:
        assert_valid_callback_token(make_request(), {"token": "not-a-jwt"})

    assert exc_info.value.status_code == 403
    assert exc_info.value.error_code == "invalid_onlyoffice_jwt"
