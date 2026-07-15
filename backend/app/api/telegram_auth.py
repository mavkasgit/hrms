"""Telegram auth HTTP routes (bot challenge/webhook + link)."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import LoginResponse
from app.api.deps import CurrentUser, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import SlidingWindowRateLimiter
from app.schemas.telegram_auth import (
    TelegramBotChallengeRequest,
    TelegramBotChallengeResponse,
    TelegramBotChallengeStatus,
    TelegramBotConfigResponse,
    TelegramLinkRequest,
    TelegramLinkResponse,
    TelegramWidgetLoginRequest,
)
from app.services.telegram_auth_service import TelegramAuthService

router = APIRouter(prefix="/auth/telegram", tags=["auth-telegram"])

# Per-endpoint-group limiter for public telegram auth surfaces.
_telegram_public_limiter = SlidingWindowRateLimiter(
    max_requests=settings.TELEGRAM_RATE_LIMIT_REQUESTS,
    window_seconds=settings.TELEGRAM_RATE_LIMIT_WINDOW_SECONDS,
)


def _client_ip(request: Request) -> str:
    """Best-effort client IP (no X-Forwarded-For pattern elsewhere in project)."""
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def enforce_telegram_public_rate_limit(request: Request) -> None:
    """Dependency: 429 when public TG endpoint group exceeds sliding window."""
    ip = _client_ip(request)
    # Rebuild limits from settings so tests can override env-backed values.
    max_req = settings.TELEGRAM_RATE_LIMIT_REQUESTS
    window = settings.TELEGRAM_RATE_LIMIT_WINDOW_SECONDS
    if (
        _telegram_public_limiter.max_requests != max_req
        or _telegram_public_limiter.window_seconds != float(window)
    ):
        _telegram_public_limiter.max_requests = max_req
        _telegram_public_limiter.window_seconds = float(window)
    if not _telegram_public_limiter.allow(f"tg-public:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="rate_limit_exceeded",
        )


@router.get("/bot/config", response_model=TelegramBotConfigResponse)
async def get_telegram_bot_config() -> TelegramBotConfigResponse:
    """Public config for LoginPage Telegram button (no secrets)."""
    bot_username = (settings.TELEGRAM_BOT_USERNAME or "").strip()
    return TelegramBotConfigResponse(
        bot_username=bot_username,
        bot_enabled=TelegramAuthService.is_bot_login_enabled(),
    )


@router.post(
    "/widget",
    response_model=LoginResponse,
    dependencies=[Depends(enforce_telegram_public_rate_limit)],
)
async def telegram_widget_login(
    payload: TelegramWidgetLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Telegram Login Widget auth (HMAC-SHA256 with bot token).

    Primary browser path when Telegram.Login.auth returns legacy fields
    (id, hash, auth_date, …) rather than an OIDC id_token.
    """
    service = TelegramAuthService(db)
    data = payload.model_dump(exclude_none=True)
    result = await service.login_with_widget(data)
    return LoginResponse(**result)


@router.post(
    "/bot/challenge",
    response_model=TelegramBotChallengeResponse,
    dependencies=[Depends(enforce_telegram_public_rate_limit)],
)
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

    if body.purpose == "invite":
        if not body.invite_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invite_code_required",
            )
        user = await service.get_user_by_invite_code(body.invite_code)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="invalid_invite_code",
            )
        user_id = user.id

    result = await service.create_bot_challenge(purpose=body.purpose, user_id=user_id)
    return TelegramBotChallengeResponse(**result)


@router.get(
    "/bot/challenge/{challenge_id}",
    response_model=TelegramBotChallengeStatus,
    dependencies=[Depends(enforce_telegram_public_rate_limit)],
)
async def poll_bot_challenge(
    challenge_id: UUID,
    poll_secret: str | None = Query(default=None),
    x_telegram_poll_secret: str | None = Header(
        default=None, alias="X-Telegram-Poll-Secret"
    ),
    db: AsyncSession = Depends(get_db),
) -> TelegramBotChallengeStatus:
    """Poll challenge; requires poll_secret (query or X-Telegram-Poll-Secret)."""
    service = TelegramAuthService(db)
    secret = poll_secret or x_telegram_poll_secret
    result = await service.poll_bot_challenge(challenge_id, poll_secret=secret)
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
