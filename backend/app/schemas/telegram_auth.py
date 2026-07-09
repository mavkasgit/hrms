"""Pydantic schemas for Telegram auth (OIDC Phase 1 + bot/link Phase 2)."""

from typing import Literal

from pydantic import BaseModel, Field


class TelegramOidcLoginRequest(BaseModel):
    """Frontend received id_token via telegram-login.js / OIDC popup."""

    id_token: str
    nonce: str


class TelegramOidcCallbackRequest(BaseModel):
    """Optional: SPA does code exchange on backend (Phase 1 reserved)."""

    code: str
    code_verifier: str
    nonce: str


class TelegramOidcConfigResponse(BaseModel):
    enabled: bool
    client_id: str = ""
    bot_username: str = ""
    authorize_url: str = "https://oauth.telegram.org/auth"
    scopes: list[str] = Field(default_factory=lambda: ["openid", "profile"])


class TelegramBotChallengeResponse(BaseModel):
    challenge_id: str
    deep_link: str
    expires_in: int
    poll_url: str


class TelegramBotChallengeStatus(BaseModel):
    status: Literal["pending", "confirmed", "expired", "consumed"]
    access_token: str | None = None
    token_type: str = "bearer"
    username: str | None = None
    role: str | None = None
    full_name: str | None = None


class TelegramLinkRequest(BaseModel):
    """Привязка TG к текущему Bearer user (Phase 2)."""

    id_token: str | None = None
    challenge_id: str | None = None
