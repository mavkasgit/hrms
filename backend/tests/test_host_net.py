"""host_net: auto LAN IP resolve (no hardcoded office IP)."""

from __future__ import annotations

from unittest.mock import patch

from app.core import host_net


def test_normalize_auto_markers():
    assert host_net.normalize_explicit_url(None) is None
    assert host_net.normalize_explicit_url("") is None
    assert host_net.normalize_explicit_url("auto") is None
    assert host_net.normalize_explicit_url("DETECT") is None
    assert host_net.normalize_explicit_url("http://example:9000") == "http://example:9000"
    assert host_net.normalize_explicit_url("example:9000") == "http://example:9000"


def test_resolve_explicit_beats_detect():
    with patch.object(host_net, "detect_lan_ip", return_value="10.0.0.5"):
        assert (
            host_net.resolve_authentik_origin("http://idp.example:9000")
            == "http://idp.example:9000"
        )


_ENV_LAN_IP_KEYS = ("OPS_PUBLIC_IP", "OPS_HOST_LAN_IP", "HOST_LAN_IP", "SERVER_IP")


def _clear_env_lan_ips(monkeypatch) -> None:
    # Изоляция от окружения машины: env_lan_ip() читает эти переменные раньше detect
    for key in _ENV_LAN_IP_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_resolve_auto_uses_detect(monkeypatch):
    _clear_env_lan_ips(monkeypatch)
    host_net.detect_lan_ip.cache_clear()
    with patch.object(host_net, "detect_lan_ip", return_value="10.20.30.40"):
        # re-patch cached function: clear after patching
        host_net.detect_lan_ip.cache_clear()
        with patch.object(host_net, "detect_lan_ip", return_value="10.20.30.40"):
            origin = host_net.resolve_authentik_origin("auto")
    assert origin == "http://10.20.30.40:9000"


def test_resolve_env_lan_ip(monkeypatch):
    _clear_env_lan_ips(monkeypatch)
    host_net.detect_lan_ip.cache_clear()
    monkeypatch.setenv("HOST_LAN_IP", "172.17.10.12")
    with patch.object(host_net, "detect_lan_ip", return_value="10.0.0.1"):
        origin = host_net.resolve_authentik_origin("auto")
    assert origin == "http://172.17.10.12:9000"
    monkeypatch.delenv("HOST_LAN_IP", raising=False)
