"""Lightweight User-Agent → human-readable device label (no heavy libs)."""

from __future__ import annotations


def device_label_from_ua(user_agent: str | None) -> str:
    """
    Parse UA into \"Browser (OS)\" similar to profile modal client-side parse.

    Examples: \"Google Chrome (Windows)\", \"Mozilla Firefox (Linux)\".
    Falls back to \"Неизвестное устройство\".
    """
    if not user_agent or not str(user_agent).strip():
        return "Неизвестное устройство"

    ua = str(user_agent)

    # OS (order matters: Android before Linux; iOS before Mac)
    if "Android" in ua:
        os_name = "Android"
    elif "iPhone" in ua or "iPad" in ua or "iPod" in ua or "like Mac" in ua:
        os_name = "iOS"
    elif "Win" in ua:
        os_name = "Windows"
    elif "Mac" in ua:
        os_name = "macOS"
    elif "Linux" in ua:
        os_name = "Linux"
    else:
        os_name = "Неизвестная ОС"

    # Browser (order matters: Edge/Opera/Samsung before Chrome; Chrome before Safari)
    if "Firefox" in ua:
        browser = "Mozilla Firefox"
    elif "SamsungBrowser" in ua:
        browser = "Samsung Browser"
    elif "Opera" in ua or "OPR" in ua:
        browser = "Opera"
    elif "Edg/" in ua or "Edge" in ua or "Edg " in ua:
        browser = "Microsoft Edge"
    elif "Chrome" in ua or "CriOS" in ua:
        browser = "Google Chrome"
    elif "Safari" in ua:
        browser = "Apple Safari"
    else:
        browser = "Неизвестный браузер"

    if browser == "Неизвестный браузер" and os_name == "Неизвестная ОС":
        return "Неизвестное устройство"

    return f"{browser} ({os_name})"
