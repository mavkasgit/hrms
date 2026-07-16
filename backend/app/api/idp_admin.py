"""
IdP admin proxy API (SSO-D).

Prefix: /api/idp
- GET  /config       — admin config + deep links (admin)
- GET  /links        — public deep links for any authenticated user
- GET  /users        — list Authentik users + hrms groups (admin)
- PUT  /users/{pk}/access — set admin|viewer|none via group membership (admin)
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, get_current_user
from app.core.config import settings
from app.services import authentik_admin_service as ak

router = APIRouter(prefix="/idp", tags=["idp"])


def _require_admin(user: CurrentUser) -> None:
    if getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


class IdpConfigOut(BaseModel):
    oidc_enabled: bool
    idp_admin_enabled: bool
    public_url: str | None = None
    user_settings_url: str | None = None
    admin_url: str | None = None
    groups: list[str] = Field(default_factory=lambda: list(ak.HRMS_ACCESS_GROUPS))


class IdpLinksOut(BaseModel):
    oidc_enabled: bool
    user_settings_url: str | None = None


class IdpUserOut(BaseModel):
    pk: int
    username: str
    name: str = ""
    email: str = ""
    is_active: bool = True
    groups: list[str] = Field(default_factory=list)
    access_level: str | None = None


class IdpUsersListOut(BaseModel):
    items: list[IdpUserOut]


class IdpAccessBody(BaseModel):
    access_level: Literal["admin", "viewer", "none"]


def _access_from_groups(groups: list[str]) -> str:
    if ak.HRMS_ADMIN_GROUP in groups:
        return "admin"
    if ak.HRMS_VIEWER_GROUP in groups:
        return "viewer"
    return "none"


@router.get("/links", response_model=IdpLinksOut)
async def get_idp_links(
    _current_user: CurrentUser = Depends(get_current_user),
) -> IdpLinksOut:
    """Deep-links for profile (any authenticated user). No Admin API token required."""
    return IdpLinksOut(
        oidc_enabled=bool(settings.AUTH_OIDC_ENABLED),
        user_settings_url=ak.user_settings_url(),
    )


@router.get("/config", response_model=IdpConfigOut)
async def get_idp_config(
    current_user: CurrentUser = Depends(get_current_user),
) -> IdpConfigOut:
    """Admin page config: whether proxy works + deep-link URLs."""
    _require_admin(current_user)
    return IdpConfigOut(
        oidc_enabled=bool(settings.AUTH_OIDC_ENABLED),
        idp_admin_enabled=ak.is_idp_admin_enabled(),
        public_url=ak.public_base_url(),
        user_settings_url=ak.user_settings_url(),
        admin_url=ak.admin_url(),
        groups=list(ak.HRMS_ACCESS_GROUPS),
    )


@router.get("/users", response_model=IdpUsersListOut)
async def list_idp_users(
    current_user: CurrentUser = Depends(get_current_user),
) -> IdpUsersListOut:
    _require_admin(current_user)
    if not ak.is_idp_admin_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="idp_admin_disabled",
        )
    try:
        raw = await ak.list_idp_users()
    except ak.AuthentikAdminError as exc:
        code = exc.status_code or 502
        if code == 503:
            raise HTTPException(status_code=503, detail=exc.message) from exc
        raise HTTPException(status_code=502, detail=exc.message) from exc

    items = [
        IdpUserOut(
            pk=u["pk"],
            username=u.get("username") or "",
            name=u.get("name") or "",
            email=u.get("email") or "",
            is_active=bool(u.get("is_active", True)),
            groups=list(u.get("groups") or []),
            access_level=_access_from_groups(list(u.get("groups") or [])),
        )
        for u in raw
    ]
    return IdpUsersListOut(items=items)


@router.put("/users/{pk}/access", response_model=IdpUserOut)
async def set_idp_user_access(
    pk: int,
    body: IdpAccessBody,
    current_user: CurrentUser = Depends(get_current_user),
) -> IdpUserOut:
    _require_admin(current_user)
    if not ak.is_idp_admin_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="idp_admin_disabled",
        )
    try:
        raw = await ak.set_user_access(pk, body.access_level)
    except ak.AuthentikAdminError as exc:
        code = exc.status_code or 502
        if code == 400:
            raise HTTPException(status_code=400, detail=exc.message) from exc
        if code == 503:
            raise HTTPException(status_code=503, detail=exc.message) from exc
        raise HTTPException(status_code=502, detail=exc.message) from exc

    groups = list(raw.get("groups") or [])
    return IdpUserOut(
        pk=raw["pk"],
        username=raw.get("username") or "",
        name=raw.get("name") or "",
        email=raw.get("email") or "",
        is_active=bool(raw.get("is_active", True)),
        groups=groups,
        access_level=raw.get("access_level") or _access_from_groups(groups),
    )
