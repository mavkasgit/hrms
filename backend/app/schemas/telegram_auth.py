"""Pydantic schemas for Telegram auth (bot/QR deep-link + Widget)."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class TelegramBotConfigResponse(BaseModel):
    """Публичная конфигурация Telegram-бота для страницы логина (без секретов)."""

    bot_username: str = ""
    bot_enabled: bool = False


class TelegramWidgetLoginRequest(BaseModel):
    """Telegram Login Widget callback fields (HMAC verified server-side)."""

    id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str


class TelegramBotChallengeRequest(BaseModel):
    purpose: Literal["login", "link", "invite"] = "login"
    invite_code: str | None = None


class TelegramBotChallengeResponse(BaseModel):
    challenge_id: str
    poll_secret: str
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
    require_password_setup: bool | None = None


class TelegramLinkRequest(BaseModel):
    """Привязка TG к текущему Bearer user (Phase 2)."""

    id_token: str | None = None
    nonce: str | None = None
    challenge_id: UUID | str | None = None


class TelegramLinkResponse(BaseModel):
    telegram_id: int | None = None
    linked: bool
