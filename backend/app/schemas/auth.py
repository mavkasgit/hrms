"""Pydantic schemas for the /auth router (login, me, profile)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class BreakGlassLoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    full_name: str
    # Present after OIDC callback only — FE keeps for Authentik end-session id_token_hint
    id_token: str | None = None


class AvatarSeedUpdate(BaseModel):
    """Payload для PATCH /auth/me/avatar. NULL = сбросить (пустая заглушка на UI)."""
    avatar_seed: str | None = Field(None, max_length=64)


class ProfileUpdate(BaseModel):
    """Human-profile патч (SoT Authentik при наличии sub + API token).

    Канон user-settings 2.0.0: здесь только предпочтения theme/locale.
    ФИО/email остаются в схеме намеренно — чтобы попытка их изменить
    давала понятный 403 (а не 422 «неизвестное поле»). Аватар меняется
    только через отдельный ``PATCH /auth/me/avatar`` (AvatarSeedUpdate).
    """
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(None, min_length=1, max_length=255)
    email: EmailStr | None = None
    locale: Literal["ru", "en"] | None = None
    theme: Literal["system", "light", "dark"] | None = None


class MeResponse(BaseModel):
    """GET /auth/me — унифицированный профиль (канон user-settings 2.0.0).

    Значения приходят как plain dict из сервиса; схема фиксирует контракт:
    лишние/мусорные ключи клиент не получит, изменения полей поймает
    компилятор/тесты, а не регрессия в UI.
    """
    username: str
    role: str
    full_name: str
    email: str | None = None
    locale: str | None = None
    theme: str | None = None
    avatar_seed: str | None = None
    authentik_linked: bool = False
    profile_sot: str = "local"
    is_break_glass: bool = False
