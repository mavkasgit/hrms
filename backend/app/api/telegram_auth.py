"""Telegram auth HTTP routes (OIDC Phase 1)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import LoginResponse
from app.core.config import settings
from app.core.database import get_db
from app.schemas.telegram_auth import TelegramOidcConfigResponse, TelegramOidcLoginRequest
from app.services.telegram_auth_service import (
    TELEGRAM_AUTHORIZE_URL,
    TelegramAuthService,
)

router = APIRouter(prefix="/auth/telegram", tags=["auth-telegram"])


@router.get("/oidc/config", response_model=TelegramOidcConfigResponse)
async def get_telegram_oidc_config() -> TelegramOidcConfigResponse:
    """Public config for LoginPage Telegram button (no secrets)."""
    client_id = (settings.TELEGRAM_OIDC_CLIENT_ID or "").strip()
    bot_username = (settings.TELEGRAM_BOT_USERNAME or "").strip()
    return TelegramOidcConfigResponse(
        enabled=bool(client_id),
        client_id=client_id,
        bot_username=bot_username,
        authorize_url=TELEGRAM_AUTHORIZE_URL,
        scopes=["openid", "profile"],
    )


@router.post("/oidc", response_model=LoginResponse)
async def telegram_oidc_login(
    payload: TelegramOidcLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Exchange Telegram OIDC id_token + nonce for HRMS LoginResponse.

    Verifies JWKS signature, iss/aud/exp/nonce, then resolve/provision User.
    """
    service = TelegramAuthService(db)
    result = await service.login_with_oidc(payload.id_token, payload.nonce)
    return LoginResponse(**result)
