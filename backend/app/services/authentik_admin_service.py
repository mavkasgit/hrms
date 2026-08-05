"""
Authentik Admin API proxy (SSO-D) — тонкая обёртка над authentik_client.

Общий сетевой слой (httpx, заголовки, обработка ошибок, резолв origin) живёт в
``app.services.authentik_client`` (канон, копируется между приложениями).
Здесь остаётся HRMS-специфика: фиксированные группы hrms-admin/hrms-viewer,
листинг/управление пользователями и deep-link URL-ы. Публичный контракт модуля
(is_idp_admin_enabled, _request, AuthentikAdminError, …) сохранён для
потребителей (deep-links, admin-прокси).
"""

from __future__ import annotations

from typing import Any, Literal

from app.core.config import settings
from app.services.authentik_client import (
    AuthentikAdminError,
    _request,
    is_idp_admin_enabled,
    public_base_url,
    resolved_authentik_api_origin,
)

__all__ = [
    "AccessLevel",
    "AuthentikAdminError",
    "HRMS_ACCESS_GROUPS",
    "HRMS_ADMIN_GROUP",
    "HRMS_VIEWER_GROUP",
    "admin_url",
    "idp_links_data",
    "is_idp_admin_enabled",
    "list_idp_users",
    "ops_url",
    "public_base_url",
    "resolved_authentik_api_origin",
    "set_user_access",
    "sso_dashboard_url",
    "user_settings_url",
]

HRMS_ADMIN_GROUP = "hrms-admin"
HRMS_VIEWER_GROUP = "hrms-viewer"
HRMS_ACCESS_GROUPS = (HRMS_ADMIN_GROUP, HRMS_VIEWER_GROUP)

AccessLevel = Literal["admin", "viewer", "none"]


def idp_links_data() -> dict:
    """Deep-links payload профиля (общий для /auth/me/links и /idp/links).

    Канон user-settings 2.0.0: две кнопки в блоке «Способы входа в систему» —
    дашборд SSO (``sso_dashboard_url``) и сразу настройки входа
    (``user_settings_url``).
    """
    return {
        "oidc_enabled": bool(settings.AUTH_OIDC_ENABLED),
        "user_settings_url": user_settings_url(),
        "sso_dashboard_url": sso_dashboard_url(),
    }


def user_settings_url() -> str | None:
    """Страница настроек входа Authentik (таргет кнопки «Открыть настройки входа»)."""
    base = public_base_url()
    return f"{base}/if/user/#/settings" if base else None


def sso_dashboard_url() -> str | None:
    """Дашборд Authentik (таргет кнопки «Дашборд SSO»)."""
    base = public_base_url()
    return f"{base}/if/user/" if base else None


def admin_url() -> str | None:
    base = public_base_url()
    return f"{base}/if/admin/" if base else None


def ops_url() -> str | None:
    """IdP Ops UI (directory / invite / roles) — same host as Authentik, port 9010."""
    base = public_base_url()
    if not base:
        return None
    from urllib.parse import urlparse

    p = urlparse(base)
    if not p.scheme or not p.hostname:
        return None
    return f"{p.scheme}://{p.hostname}:9010"


async def _resolve_group_uuid(name: str) -> str:
    data = await _request("GET", "/core/groups/", params={"name": name, "page_size": 10})
    results = data.get("results") if isinstance(data, dict) else None
    if not results:
        # Fallback: search without exact filter
        data = await _request("GET", "/core/groups/", params={"search": name, "page_size": 50})
        results = data.get("results") if isinstance(data, dict) else None
    if not results:
        raise AuthentikAdminError(f"Group '{name}' not found in Authentik", status_code=502)
    for g in results:
        if g.get("name") == name:
            pk = g.get("pk") or g.get("uuid")
            if pk:
                return str(pk)
    # First match if exact name filter worked
    pk = results[0].get("pk") or results[0].get("uuid")
    if not pk:
        raise AuthentikAdminError(f"Group '{name}' missing pk", status_code=502)
    return str(pk)


async def _group_uuid_cache() -> dict[str, str]:
    return {
        HRMS_ADMIN_GROUP: await _resolve_group_uuid(HRMS_ADMIN_GROUP),
        HRMS_VIEWER_GROUP: await _resolve_group_uuid(HRMS_VIEWER_GROUP),
    }


def _group_names_from_user(user: dict[str, Any], uuid_to_name: dict[str, str]) -> list[str]:
    """Extract hrms-* group names from Authentik user payload."""
    names: list[str] = []
    groups = user.get("groups") or []
    # groups may be list of UUID strings or nested objects
    for g in groups:
        if isinstance(g, str):
            name = uuid_to_name.get(g)
            if name:
                names.append(name)
        elif isinstance(g, dict):
            name = g.get("name")
            if name in HRMS_ACCESS_GROUPS:
                names.append(name)
            else:
                pk = str(g.get("pk") or g.get("uuid") or "")
                mapped = uuid_to_name.get(pk)
                if mapped:
                    names.append(mapped)
    # groups_obj on some serializers
    for g in user.get("groups_obj") or []:
        if isinstance(g, dict) and g.get("name") in HRMS_ACCESS_GROUPS:
            if g["name"] not in names:
                names.append(g["name"])
    return names


async def list_idp_users(*, page_size: int = 100) -> list[dict[str, Any]]:
    """List Authentik users with hrms group membership normalized."""
    uuid_map = await _group_uuid_cache()
    uuid_to_name = {v: k for k, v in uuid_map.items()}

    items: list[dict[str, Any]] = []
    page = 1
    while True:
        data = await _request(
            "GET",
            "/core/users/",
            params={"page": page, "page_size": min(page_size, 100)},
        )
        results = data.get("results") if isinstance(data, dict) else []
        if not results:
            break
        for u in results:
            pk = u.get("pk")
            if pk is None:
                continue
            group_names = _group_names_from_user(u, uuid_to_name)
            # List endpoint often returns only group UUIDs — already handled.
            # If still empty and we only have UUIDs not in map, leave empty.
            items.append(
                {
                    "pk": int(pk) if not isinstance(pk, int) else pk,
                    "username": u.get("username") or "",
                    "name": u.get("name") or "",
                    "email": u.get("email") or "",
                    "is_active": bool(u.get("is_active", True)),
                    "groups": [g for g in group_names if g in HRMS_ACCESS_GROUPS],
                }
            )
        if not data.get("pagination", {}).get("next") and not data.get("next"):
            # authentik uses pagination.next or relative next URL
            if page * min(page_size, 100) >= (data.get("pagination") or {}).get("count", 0):
                break
            if len(results) < min(page_size, 100):
                break
        page += 1
        if page > 50:  # safety
            break

    # Enrich groups if list payload omitted names (UUIDs only outside our map).
    # Optional second pass for users with empty groups: retrieve detail once is heavy;
    # instead re-fetch each target group members if needed.
    if any(not it["groups"] for it in items):
        await _enrich_membership_from_groups(items, uuid_map)

    return items


async def _enrich_membership_from_groups(
    items: list[dict[str, Any]],
    uuid_map: dict[str, str],
) -> None:
    """Fill groups via group.users member lists when user.list lacks group names."""
    pk_to_item = {it["pk"]: it for it in items}
    for group_name, group_uuid in uuid_map.items():
        try:
            data = await _request("GET", f"/core/groups/{group_uuid}/")
        except AuthentikAdminError:
            continue
        user_pks = data.get("users") or []
        for upk in user_pks:
            try:
                key = int(upk)
            except (TypeError, ValueError):
                continue
            item = pk_to_item.get(key)
            if item is not None and group_name not in item["groups"]:
                item["groups"].append(group_name)


async def set_user_access(user_pk: int, access_level: AccessLevel) -> dict[str, Any]:
    """
    Set exclusive membership among hrms-admin / hrms-viewer.
    admin  → only hrms-admin
    viewer → only hrms-viewer
    none   → remove both
    """
    if access_level not in ("admin", "viewer", "none"):
        raise AuthentikAdminError(f"Invalid access_level: {access_level}", status_code=400)

    uuid_map = await _group_uuid_cache()
    admin_uuid = uuid_map[HRMS_ADMIN_GROUP]
    viewer_uuid = uuid_map[HRMS_VIEWER_GROUP]

    # Current membership from group member lists (reliable)
    async def _in_group(group_uuid: str) -> bool:
        data = await _request("GET", f"/core/groups/{group_uuid}/")
        users = data.get("users") or []
        return user_pk in users or str(user_pk) in {str(x) for x in users}

    in_admin = await _in_group(admin_uuid)
    in_viewer = await _in_group(viewer_uuid)

    want_admin = access_level == "admin"
    want_viewer = access_level == "viewer"

    async def add(group_uuid: str) -> None:
        await _request(
            "POST",
            f"/core/groups/{group_uuid}/add_user/",
            json_body={"pk": user_pk},
        )

    async def remove(group_uuid: str) -> None:
        await _request(
            "POST",
            f"/core/groups/{group_uuid}/remove_user/",
            json_body={"pk": user_pk},
        )

    if want_admin and not in_admin:
        await add(admin_uuid)
    if not want_admin and in_admin:
        await remove(admin_uuid)
    if want_viewer and not in_viewer:
        await add(viewer_uuid)
    if not want_viewer and in_viewer:
        await remove(viewer_uuid)

    groups: list[str] = []
    if want_admin:
        groups.append(HRMS_ADMIN_GROUP)
    if want_viewer:
        groups.append(HRMS_VIEWER_GROUP)

    # Fetch user for response fields
    user = await _request("GET", f"/core/users/{user_pk}/")
    return {
        "pk": user_pk,
        "username": (user or {}).get("username") or "",
        "name": (user or {}).get("name") or "",
        "email": (user or {}).get("email") or "",
        "is_active": bool((user or {}).get("is_active", True)),
        "groups": groups,
        "access_level": access_level,
    }
