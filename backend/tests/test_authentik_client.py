"""authentik_client: общий httpx-клиент к Authentik Admin API (канон)."""

from __future__ import annotations

import httpx
import pytest

from app.core.config import settings
from app.services import authentik_client as ac

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest.fixture
def idp_api_on():
    original = {
        "AUTH_OIDC_ENABLED": settings.AUTH_OIDC_ENABLED,
        "AUTHENTIK_API_URL": settings.AUTHENTIK_API_URL,
        "AUTHENTIK_API_TOKEN": settings.AUTHENTIK_API_TOKEN,
        "AUTHENTIK_PUBLIC_URL": settings.AUTHENTIK_PUBLIC_URL,
    }
    settings.AUTH_OIDC_ENABLED = True
    settings.AUTHENTIK_API_URL = "http://localhost:9000"
    settings.AUTHENTIK_API_TOKEN = "test-token"
    settings.AUTHENTIK_PUBLIC_URL = "http://localhost:9000"
    yield
    for k, v in original.items():
        setattr(settings, k, v)


def _patch_client(transport: httpx.MockTransport):
    from unittest.mock import patch

    real_client = httpx.AsyncClient(transport=transport)

    def factory(*args, **kwargs) -> httpx.AsyncClient:
        return real_client

    return patch.object(httpx, "AsyncClient", side_effect=factory)


async def test_is_idp_admin_enabled(idp_api_on):
    assert ac.is_idp_admin_enabled() is True


async def test_is_idp_admin_enabled_off_by_default():
    original = settings.AUTH_OIDC_ENABLED
    settings.AUTH_OIDC_ENABLED = False
    try:
        assert ac.is_idp_admin_enabled() is False
    finally:
        settings.AUTH_OIDC_ENABLED = original


async def test_api_base_appends_v3(idp_api_on):
    assert ac._api_base() == "http://localhost:9000/api/v3"


async def test_api_base_keeps_existing_v3(idp_api_on):
    original = settings.AUTHENTIK_API_URL
    settings.AUTHENTIK_API_URL = "http://localhost:9000/api/v3"
    try:
        assert ac._api_base() == "http://localhost:9000/api/v3"
    finally:
        settings.AUTHENTIK_API_URL = original


async def test_request_sends_bearer_and_returns_json(idp_api_on):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer test-token"
        assert request.headers["Accept"] == "application/json"
        return httpx.Response(200, json={"results": [{"pk": 1}]})

    with _patch_client(httpx.MockTransport(handler)):
        data = await ac._request("GET", "/core/users/")
    assert data == {"results": [{"pk": 1}]}


async def test_request_passes_client_error_code(idp_api_on):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text="email taken")

    with _patch_client(httpx.MockTransport(handler)):
        with pytest.raises(ac.AuthentikAdminError) as exc:
            await ac._request("GET", "/core/users/")
    assert exc.value.status_code == 400


async def test_request_maps_server_error_to_502(idp_api_on):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    with _patch_client(httpx.MockTransport(handler)):
        with pytest.raises(ac.AuthentikAdminError) as exc:
            await ac._request("GET", "/core/users/")
    assert exc.value.status_code == 502


async def test_request_unreachable_maps_to_502(idp_api_on):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    with _patch_client(httpx.MockTransport(handler)):
        with pytest.raises(ac.AuthentikAdminError) as exc:
            await ac._request("GET", "/core/users/")
    assert exc.value.status_code == 502
