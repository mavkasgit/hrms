"""
Unified human profile — Authentik is source of truth, app DB is cache.

v1 fields:
  full_name  → Authentik user.name
  avatar_seed → Authentik user.attributes.profile_avatar_seed

Link key: local users.authentik_sub == Authentik user.uuid (OIDC sub).
When AUTHENTIK_API_TOKEN is missing or user has no sub → local-only mode.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.core.config import settings
from app.services.authentik_admin_service import AuthentikAdminError, _request, is_idp_admin_enabled

logger = logging.getLogger(__name__)

ATTR_AVATAR_SEED = "profile_avatar_seed"


@dataclass
class UnifiedProfile:
    full_name: str | None
    avatar_seed: str | None
    authentik_pk: int | None = None
    source: str = "local"  # local | idp | bootstrap


def profile_sync_enabled() -> bool:
    """True when backend can call Authentik Admin API (token + URL + OIDC flag)."""
    return is_idp_admin_enabled()


async def _find_user_by_sub(authentik_sub: str) -> dict[str, Any] | None:
    """Resolve Authentik user by uuid (OIDC sub)."""
    sub = (authentik_sub or "").strip()
    if not sub:
        return None
    # Prefer uuid filter (Authentik core users)
    data = await _request(
        "GET",
        "/core/users/",
        params={"uuid": sub, "page_size": 5},
    )
    results = data.get("results") if isinstance(data, dict) else None
    if results:
        for u in results:
            if str(u.get("uuid") or "") == sub:
                return u
        return results[0]
    # Fallback: search
    data = await _request(
        "GET",
        "/core/users/",
        params={"search": sub, "page_size": 20},
    )
    results = data.get("results") if isinstance(data, dict) else None
    if not results:
        return None
    for u in results:
        if str(u.get("uuid") or "") == sub:
            return u
    return None


def _attrs(user: dict[str, Any]) -> dict[str, Any]:
    raw = user.get("attributes")
    return dict(raw) if isinstance(raw, dict) else {}


def profile_from_ak_user(user: dict[str, Any]) -> UnifiedProfile:
    attrs = _attrs(user)
    seed = attrs.get(ATTR_AVATAR_SEED)
    if seed is not None:
        seed = str(seed).strip() or None
    name = user.get("name")
    name_s = str(name).strip() if name else None
    pk = user.get("pk")
    try:
        pk_i = int(pk) if pk is not None else None
    except (TypeError, ValueError):
        pk_i = None
    return UnifiedProfile(
        full_name=name_s,
        avatar_seed=seed,
        authentik_pk=pk_i,
        source="idp",
    )


async def fetch_profile_by_sub(authentik_sub: str) -> UnifiedProfile | None:
    """Load profile from Authentik. None if not found / API off."""
    if not profile_sync_enabled():
        return None
    try:
        user = await _find_user_by_sub(authentik_sub)
    except AuthentikAdminError as exc:
        logger.warning("unified profile fetch failed: %s", exc.message)
        return None
    if not user:
        return None
    return profile_from_ak_user(user)


async def push_profile_by_sub(
    authentik_sub: str,
    *,
    full_name: str | None = None,
    avatar_seed: str | None | object = ...,
) -> UnifiedProfile:
    """
    Write profile fields to Authentik.

    avatar_seed:
      - Ellipsis (...) → leave unchanged
      - None → clear attribute
      - str → set
    full_name:
      - None → leave unchanged
      - str → set Authentik name
    """
    if not profile_sync_enabled():
        raise AuthentikAdminError(
            "IdP profile sync is not configured (AUTHENTIK_API_*)",
            status_code=503,
        )
    user = await _find_user_by_sub(authentik_sub)
    if not user:
        raise AuthentikAdminError(
            f"Authentik user not found for sub={authentik_sub!r}",
            status_code=404,
        )
    pk = user.get("pk")
    if pk is None:
        raise AuthentikAdminError("Authentik user missing pk", status_code=502)

    body: dict[str, Any] = {}
    if full_name is not None:
        body["name"] = full_name.strip()

    if avatar_seed is not ...:
        attrs = _attrs(user)
        if avatar_seed is None:
            attrs.pop(ATTR_AVATAR_SEED, None)
        else:
            seed_s = str(avatar_seed).strip()
            if not seed_s:
                attrs.pop(ATTR_AVATAR_SEED, None)
            else:
                if len(seed_s) > 64:
                    raise AuthentikAdminError("avatar_seed max length 64", status_code=400)
                attrs[ATTR_AVATAR_SEED] = seed_s
        body["attributes"] = attrs

    if not body:
        return profile_from_ak_user(user)

    updated = await _request("PATCH", f"/core/users/{pk}/", json_body=body)
    if isinstance(updated, dict) and updated.get("pk") is not None:
        return profile_from_ak_user(updated)
    # Some Authentik versions return partial — re-fetch
    refreshed = await _request("GET", f"/core/users/{pk}/")
    if not isinstance(refreshed, dict):
        raise AuthentikAdminError("Empty response after profile PATCH", status_code=502)
    return profile_from_ak_user(refreshed)


async def sync_local_from_idp(
    *,
    authentik_sub: str | None,
    local_full_name: str | None,
    local_avatar_seed: str | None,
) -> UnifiedProfile | None:
    """
    Pull IdP profile; if IdP avatar empty and local has seed — bootstrap push.

    Returns merged snapshot to apply to local cache, or None if no IdP.
    """
    if not authentik_sub or not profile_sync_enabled():
        return None
    remote = await fetch_profile_by_sub(authentik_sub)
    if remote is None:
        return None

    # Bootstrap: first time after deploy — publish local avatar to IdP
    if remote.avatar_seed is None and local_avatar_seed:
        try:
            remote = await push_profile_by_sub(
                authentik_sub,
                avatar_seed=local_avatar_seed,
            )
            remote.source = "bootstrap"
            logger.info("Bootstrapped profile_avatar_seed to IdP for sub=%s", authentik_sub[:8])
        except AuthentikAdminError as exc:
            logger.warning("avatar bootstrap push failed: %s", exc.message)
            # still return remote name if any
            return UnifiedProfile(
                full_name=remote.full_name or local_full_name,
                avatar_seed=local_avatar_seed,
                authentik_pk=remote.authentik_pk,
                source="local",
            )

    # Prefer IdP values when present; keep local name if IdP name empty
    return UnifiedProfile(
        full_name=(remote.full_name or local_full_name),
        avatar_seed=remote.avatar_seed if remote.avatar_seed is not None else local_avatar_seed,
        authentik_pk=remote.authentik_pk,
        source=remote.source,
    )


def apply_profile_to_user(user: Any, profile: UnifiedProfile) -> bool:
    """Mutate ORM user cache fields. Returns True if any field changed."""
    changed = False
    if profile.full_name and profile.full_name != (user.full_name or ""):
        user.full_name = profile.full_name
        changed = True
    # snapshot from sync_local_from_idp already merges local fallbacks
    if profile.avatar_seed != user.avatar_seed:
        user.avatar_seed = profile.avatar_seed
        changed = True
    return changed
