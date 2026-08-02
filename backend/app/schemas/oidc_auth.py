"""Pydantic schemas for OIDC / Authentik bridge endpoints."""

from pydantic import BaseModel, Field


class OidcConfigResponse(BaseModel):
    """Public OIDC client config for FE authorize URL + PKCE."""

    enabled: bool
    authorization_url: str | None = None
    client_id: str | None = None
    redirect_uri: str | None = None
    scopes: str | None = None
    issuer: str | None = None
    login_hint_enabled: bool = True
    sso_only: bool = False


class OidcCallbackRequest(BaseModel):
    """Authorization code + PKCE verifier from FE /auth/callback."""

    code: str = Field(..., min_length=1)
    code_verifier: str = Field(..., min_length=1)
    state: str | None = None
    redirect_uri: str | None = None  # optional override; defaults to settings


class OidcLogoutUrlResponse(BaseModel):
    """Authentik end_session URL for FE post-logout redirect."""

    enabled: bool
    logout_url: str | None = None
