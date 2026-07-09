"""Telegram auth HTTP routes (OIDC + bot challenge/webhook + link)."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import LoginResponse
from app.api.deps import CurrentUser, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.schemas.telegram_auth import (
    TelegramBotChallengeRequest,
    TelegramBotChallengeResponse,
    TelegramBotChallengeStatus,
    TelegramLinkRequest,
    TelegramLinkResponse,
    TelegramOidcConfigResponse,
    TelegramOidcLoginRequest,
)
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


@router.post("/bot/challenge", response_model=TelegramBotChallengeResponse)
async def create_bot_challenge(
    request: Request,
    payload: TelegramBotChallengeRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> TelegramBotChallengeResponse:
    """Create bot deep-link challenge (login public; link requires Bearer)."""
    body = payload or TelegramBotChallengeRequest()
    service = TelegramAuthService(db)
    user_id: int | None = None

    if body.purpose == "link":
        # Require Bearer and resolve local user id
        current = await get_current_user(request, db)
        user = await service.get_user_by_username(current.username)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authentication token",
            )
        user_id = user.id

    result = await service.create_bot_challenge(purpose=body.purpose, user_id=user_id)
    return TelegramBotChallengeResponse(**result)


@router.get(
    "/bot/challenge/{challenge_id}",
    response_model=TelegramBotChallengeStatus,
)
async def poll_bot_challenge(
    challenge_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> TelegramBotChallengeStatus:
    """Poll challenge; on first confirmed login returns JWT once then consumes."""
    service = TelegramAuthService(db)
    result = await service.poll_bot_challenge(challenge_id)
    return TelegramBotChallengeStatus(**result)


@router.post("/webhook")
async def telegram_webhook(
    update: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    x_telegram_bot_api_secret_token: str | None = Header(
        default=None, alias="X-Telegram-Bot-Api-Secret-Token"
    ),
) -> dict[str, Any]:
    """Telegram Bot API webhook. Secret required; process /start TOKEN."""
    service = TelegramAuthService(db)
    return await service.handle_webhook(
        update, secret_header=x_telegram_bot_api_secret_token
    )


@router.post("/link", response_model=TelegramLinkResponse)
async def link_telegram(
    payload: TelegramLinkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> TelegramLinkResponse:
    """Привязать telegram_id к текущему Bearer user."""
    service = TelegramAuthService(db)
    user = await service.get_user_by_username(current_user.username)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )
    result = await service.link_to_current_user(
        user,
        id_token=payload.id_token,
        nonce=payload.nonce,
        challenge_id=payload.challenge_id,
    )
    return TelegramLinkResponse(**result)


@router.delete("/link", response_model=TelegramLinkResponse)
async def unlink_telegram(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> TelegramLinkResponse:
    """Отвязать telegram_id у текущего пользователя."""
    service = TelegramAuthService(db)
    user = await service.get_user_by_username(current_user.username)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )
    result = await service.unlink_current_user(user)
    return TelegramLinkResponse(**result)
