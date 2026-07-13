"""Telegram auth HTTP routes (OIDC + Login Widget + bot challenge/webhook + link)."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
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
    TelegramWidgetLoginRequest,
)
from app.services.telegram_auth_service import (
    TELEGRAM_AUTHORIZE_URL,
    TelegramAuthService,
)

router = APIRouter(prefix="/auth/telegram", tags=["auth-telegram"])


def _dev_confirm_html(
    *,
    token: str = "",
    message: str | None = None,
    error: str | None = None,
    ok: bool = False,
) -> str:
    """Minimal self-contained confirm page for dev QR (no frontend build)."""
    status_block = ""
    if ok and message:
        status_block = (
            f'<p style="color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;'
            f'padding:12px;border-radius:8px">{message}</p>'
        )
    elif error:
        status_block = (
            f'<p style="color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;'
            f'padding:12px;border-radius:8px">{error}</p>'
        )
    form_block = ""
    if not ok:
        form_block = f"""
        <form method="post" action="/api/auth/telegram/bot/dev-confirm">
          <input type="hidden" name="token" value="{token}" />
          <label style="display:block;font-size:14px;margin-bottom:6px">
            Логин HRMS (профиль, в который войти)
          </label>
          <input name="username" value="admin" required autocomplete="username"
            style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:12px" />
          <button type="submit"
            style="width:100%;padding:12px;background:#2AABEE;color:#fff;border:0;
            border-radius:10px;font-weight:600;cursor:pointer">
            Подтвердить вход
          </button>
        </form>
        """
    return f"""<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>HRMS · Dev Telegram QR</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;color:#0f172a">
  <h1 style="font-size:1.25rem;margin-bottom:4px">Подтверждение входа</h1>
  <p style="color:#64748b;font-size:14px;margin-top:0">
    Dev-режим: без реального бота Telegram. После подтверждения вернитесь на страницу логина.
  </p>
  {status_block}
  {form_block}
</body></html>
"""


@router.get("/oidc/config", response_model=TelegramOidcConfigResponse)
async def get_telegram_oidc_config() -> TelegramOidcConfigResponse:
    """Public config for LoginPage Telegram button (no secrets)."""
    client_id = (settings.TELEGRAM_OIDC_CLIENT_ID or "").strip()
    bot_username = (settings.TELEGRAM_BOT_USERNAME or "").strip()
    dev_qr = TelegramAuthService.is_dev_qr_enabled() and not bot_username
    return TelegramOidcConfigResponse(
        enabled=bool(client_id),
        client_id=client_id,
        bot_username=bot_username,
        authorize_url=TELEGRAM_AUTHORIZE_URL,
        scopes=["openid", "profile"],
        bot_enabled=TelegramAuthService.is_bot_login_enabled(),
        dev_qr=dev_qr,
    )


@router.post("/oidc", response_model=LoginResponse)
async def telegram_oidc_login(
    payload: TelegramOidcLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Exchange Telegram OIDC id_token + nonce for HRMS LoginResponse.

    Verifies JWKS signature, iss/aud/exp/nonce, then resolve/provision User.
    Only call when nonce was part of the OIDC authorize request.
    """
    service = TelegramAuthService(db)
    result = await service.login_with_oidc(payload.id_token, payload.nonce)
    return LoginResponse(**result)


@router.post("/widget", response_model=LoginResponse)
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


@router.get("/bot/dev-confirm", response_class=HTMLResponse)
async def bot_dev_confirm_page(
    token: str = Query(default=""),
) -> HTMLResponse:
    """QR target in dev: form to confirm login as HRMS username (DEV_BYPASS_AUTH only)."""
    if not TelegramAuthService.is_dev_qr_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if not (token or "").strip():
        return HTMLResponse(
            _dev_confirm_html(error="В ссылке нет token. Сгенерируйте QR заново на /login."),
            status_code=400,
        )
    return HTMLResponse(_dev_confirm_html(token=token.strip()))


@router.post("/bot/dev-confirm")
async def bot_dev_confirm_submit(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Confirm challenge as username.

    - form POST (from QR HTML page) → HTML response
    - JSON {"token","username"} → JSON body (tests/API)
    """
    if not TelegramAuthService.is_dev_qr_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    content_type = (request.headers.get("content-type") or "").lower()
    want_json = "application/json" in content_type
    token = ""
    username = ""

    if want_json:
        body = await request.json()
        token = str(body.get("token") or "")
        username = str(body.get("username") or "")
    else:
        form = await request.form()
        token = str(form.get("token") or "")
        username = str(form.get("username") or "")

    service = TelegramAuthService(db)
    try:
        result = await service.confirm_dev_challenge(token=token, username=username)
    except HTTPException as exc:
        if want_json:
            raise
        return HTMLResponse(
            _dev_confirm_html(token=token, error=str(exc.detail)),
            status_code=exc.status_code,
        )

    if want_json:
        return result
    return HTMLResponse(
        _dev_confirm_html(ok=True, message=result["message"], token=token)
    )


@router.get(
    "/bot/challenge/{challenge_id}",
    response_model=TelegramBotChallengeStatus,
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
