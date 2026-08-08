from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.api.deps import get_current_user, CurrentUser
from app.schemas.auth import (
    AvatarSeedUpdate,
    BreakGlassLoginRequest,
    LoginResponse,
    MeResponse,
    ProfileUpdate,
)
from app.schemas.oidc_auth import (
    OidcCallbackRequest,
    OidcConfigResponse,
    OidcLogoutUrlResponse,
)
from app.schemas.session import (
    LoginEventListOut,
    SessionListOut,
)
from app.services import break_glass_service, profile_service, session_service
from app.services.oidc_auth_service import OidcAuthService
from app.utils.client_ip import get_client_ip

router = APIRouter(prefix="/auth", tags=["auth"])


def _request_meta(request: Request) -> tuple[str | None, str | None]:
    """ip + user-agent from request (trusted proxy aware)."""
    ip = get_client_ip(request, trusted_proxy_count=settings.TRUSTED_PROXY_COUNT)
    ua = request.headers.get("user-agent")
    return ip, ua


# ─── OIDC / Authentik bridge (A3) ─────────────────────────────────────────────


@router.get("/oidc/config", response_model=OidcConfigResponse)
async def oidc_config() -> OidcConfigResponse:
    """
    Public OIDC client config for FE (authorize URL + PKCE params).
    When disabled: ``enabled=false`` and null fields.
    """
    return OidcConfigResponse(**OidcAuthService.public_config())


@router.post("/oidc/callback", response_model=LoginResponse)
async def oidc_callback(
    payload: OidcCallbackRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Exchange authorization code (+ PKCE verifier), validate id_token via JWKS,
    link/find local User, issue app JWT via ``complete_login(login_method=oidc)``.
    """
    ip, ua = _request_meta(request)
    service = OidcAuthService(db)
    result = await service.handle_callback(
        code=payload.code,
        code_verifier=payload.code_verifier,
        redirect_uri=payload.redirect_uri,
        ip=ip,
        user_agent=ua,
    )
    return LoginResponse(
        access_token=result["access_token"],
        token_type=result.get("token_type", "bearer"),
        username=result["username"],
        role=result["role"],
        full_name=result["full_name"],
        id_token=result.get("id_token"),
    )


@router.get("/oidc/logout-url", response_model=OidcLogoutUrlResponse)
async def oidc_logout_url(
    id_token_hint: str | None = Query(None, description="OIDC id_token for Authentik end-session"),
    post_logout_redirect_uri: str | None = Query(
        None, description="Allowed post-logout landing (requires id_token_hint)"
    ),
) -> OidcLogoutUrlResponse:
    """Authentik end_session URL for FE.

    With registered post-logout URIs Authentik requires ``id_token_hint`` whenever
    ``post_logout_redirect_uri`` is set — otherwise 400 malformed.
    """
    if not OidcAuthService.is_enabled():
        return OidcLogoutUrlResponse(enabled=False, logout_url=None)
    return OidcLogoutUrlResponse(
        enabled=True,
        logout_url=OidcAuthService.logout_url(
            id_token_hint=id_token_hint,
            post_logout_redirect_uri=post_logout_redirect_uri,
        ),
    )


@router.post("/backchannel-logout")
async def backchannel_logout(
    logout_token: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """OIDC Back-Channel Logout (public). Authentik POSTs logout_token form field.

    Orchestrated in ``OidcAuthService.handle_backchannel_logout``:
      - replay protection via jti (one-time use);
      - if sid present: revoke only sessions with that IdP sid;
      - if sid absent (e.g. user deactivation): revoke all sessions by sub;
      - audit: session_revoke event with source="authentik_backchannel".

    Unknown sub is 200 no-op (no enumeration). Invalid token -> 400.
    """
    if not logout_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid_logout_token",
        )

    service = OidcAuthService(db)
    result = await service.handle_backchannel_logout(str(logout_token).strip())
    return JSONResponse(
        content=result,
        headers={"Cache-Control": "no-store"},
    )


# ─── Break glass ──────────────────────────────────────────────────────────────


@router.post("/break-glass/login", response_model=LoginResponse)
async def break_glass_login(
    payload: BreakGlassLoginRequest,
    request: Request,
) -> LoginResponse:
    """
    Аварийный (Break Glass) вход по паролю.
    Изолирован от таблицы users и стандартного сервиса входа.
    """
    ip, ua = _request_meta(request)
    return await break_glass_service.break_glass_login(
        password=payload.password, ip=ip, user_agent=ua
    )


# ─── Me / profile ─────────────────────────────────────────────────────────────


@router.get("/me", response_model=MeResponse)
async def get_me(
    refresh: int = 0,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Получить информацию о текущем авторизованном пользователе.

    При наличии authentik_sub + AUTHENTIK_API_* подтягивает unified profile (имя/аватар)
    из Authentik в локальный кэш.
    """
    return await profile_service.get_me(
        db,
        username=current_user.username,
        full_name=current_user.full_name,
        is_break_glass=getattr(current_user, "is_break_glass", False),
        refresh=(refresh == 1),
    )


@router.patch("/me/avatar")
async def update_my_avatar(
    payload: AvatarSeedUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Установить или сбросить avatar_seed. При SSO — пишет в Authentik attributes."""
    return await profile_service.update_my_avatar(
        db,
        username=current_user.username,
        avatar_seed=payload.avatar_seed,
    )


@router.patch("/me/profile")
async def update_my_profile(
    payload: ProfileUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Обновить display-профиль (locale / theme). SoT = Authentik.

    ФИО и email — read-only для пользователя (канон user-settings 2.0.0):
    они задаются администратором IdP, приложение только читает и кэширует.
    Попытка изменить → 403. Аватар редактируется через отдельный
    ``PATCH /auth/me/avatar``.
    """
    return await profile_service.update_my_profile(
        db,
        username=current_user.username,
        payload=payload,
    )


@router.get("/me/links")
async def get_me_links(
    _current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """IdP deep-links для профиля (каноничный путь). Любой авторизованный пользователь."""
    from app.services.authentik_admin_service import idp_links_data

    return idp_links_data()


@router.get("/me/login-events", response_model=LoginEventListOut)
async def list_me_login_events(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LoginEventListOut:
    """История входов текущего пользователя (каноничный путь /auth/me/*).

    Контракт канона user-settings 2.1.0: {events: [...последние 10 по
    created_at DESC], total: N} — паритет с GET /auth/sessions.
    """
    return await session_service.list_my_login_events(
        db,
        username=current_user.username,
        is_break_glass=getattr(current_user, "is_break_glass", False),
    )


# ─── Sessions ─────────────────────────────────────────────────────────────────


@router.get("/sessions", response_model=SessionListOut)
async def list_my_sessions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionListOut:
    """Активные сессии текущего пользователя: последние MAX_SESSIONS_SHOWN + total.

    Контракт канона user-settings 2.0.0: ``{sessions: [...по last_seen_at DESC],
    total: N}``. Сессии берутся отсортированными по активности (репозиторий),
    клиенту отдаются первые MAX_SESSIONS_SHOWN, total — общее число активных сессий.
    """
    return await session_service.list_my_sessions(
        db,
        username=current_user.username,
        is_break_glass=getattr(current_user, "is_break_glass", False),
        current_session_id=current_user.session_id,
    )


@router.delete("/sessions/others", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_other_sessions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Отозвать все остальные сессии (кроме текущей). Каноничный путь."""
    await session_service.revoke_other_sessions(
        db,
        username=current_user.username,
        is_break_glass=getattr(current_user, "is_break_glass", False),
        current_session_id=current_user.session_id,
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_my_session(
    session_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Отозвать одну сессию (свою)."""
    await session_service.revoke_my_session(
        db,
        username=current_user.username,
        session_id=session_id,
        is_break_glass=getattr(current_user, "is_break_glass", False),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Отозвать текущую сессию. Auth required (Bearer).

    Idempotent 204: already-revoked / missing sid still 204 when JWT is valid.
    Missing or invalid token → 401.
    """
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    await session_service.logout(db, token=token)
