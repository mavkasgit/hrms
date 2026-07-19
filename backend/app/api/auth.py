from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
import bcrypt
from pydantic import BaseModel
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.constants import SSO_BYPASS_HASH
from app.core.database import get_db
from app.models.user import User
from app.api.deps import get_current_user, CurrentUser
from app.schemas.oidc_auth import (
    OidcCallbackRequest,
    OidcConfigResponse,
    OidcLogoutUrlResponse,
)
from app.schemas.session import LoginEventOut, SessionOut
from app.services import session_service
from app.services.oidc_auth_service import OidcAuthService
from app.services.session_service import SessionNotFoundError
from app.utils.client_ip import get_client_ip
from app.utils.user_agent import device_label_from_ua

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    full_name: str
    # Present after OIDC callback only — FE keeps for Authentik end-session id_token_hint
    id_token: str | None = None


class InviteLoginRequest(BaseModel):
    invite_code: str


def _verify_password(plain: str, hashed: str) -> bool:
    """Проверить пароль. В dev-режиме принимаем пароль 'dev' без хэша."""
    # Dev bypass: если DEV_BYPASS_AUTH включён и пароль "dev" — пропускаем
    if settings.DEV_BYPASS_AUTH and plain == "dev":
        return True
    # Обычная проверка bcrypt
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _request_meta(request: Request) -> tuple[str | None, str | None]:
    """ip + user-agent from request (trusted proxy aware)."""
    ip = get_client_ip(request, trusted_proxy_count=settings.TRUSTED_PROXY_COUNT)
    ua = request.headers.get("user-agent")
    return ip, ua


def _login_response(user: User, token: str) -> LoginResponse:
    return LoginResponse(
        access_token=token,
        username=user.username,
        role=user.role,
        full_name=user.full_name or user.username,
    )


async def _resolve_user_id(db: AsyncSession, current_user: CurrentUser) -> int:
    result = await db.execute(
        select(User).where(User.username == current_user.username, User.is_deleted == False)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )
    return user.id


# ─── OIDC / Authentik bridge (A3) ─────────────────────────────────────────────


@router.get("/oidc/config", response_model=OidcConfigResponse)
async def oidc_config() -> OidcConfigResponse:
    """
    Public OIDC client config for FE (authorize URL + PKCE params).
    When disabled: ``enabled=false`` and null fields (password/TG login unchanged).
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


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Запасной вход по логину и паролю (dual-run escape; SSO is Authentik OIDC).

    В dev-режиме (DEV_BYPASS_AUTH=True на бэкенде) принимает пароль "dev"
    для любого существующего пользователя.
    """
    ip, ua = _request_meta(request)
    result = await db.execute(
        select(User).where(User.username == payload.username, User.is_deleted == False)
    )
    user = result.scalars().first()

    if not user:
        await session_service.record_failed_login(
            db,
            username_attempted=payload.username,
            reason="invalid_credentials",
            method="password",
            ip=ip,
            user_agent=ua,
            user_id=None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )

    if not _verify_password(payload.password, user.password_hash):
        await session_service.record_failed_login(
            db,
            username_attempted=payload.username,
            reason="invalid_credentials",
            method="password",
            ip=ip,
            user_agent=ua,
            user_id=user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )

    token, _session = await session_service.complete_login(
        db,
        user=user,
        login_method="password",
        ip=ip,
        user_agent=ua,
    )
    return _login_response(user, token)


@router.post("/invite/login", response_model=LoginResponse)
async def invite_login(
    payload: InviteLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Вход по одноразовому инвайт-коду.
    """
    ip, ua = _request_meta(request)
    result = await db.execute(
        select(User).where(User.invite_code == payload.invite_code, User.is_deleted == False)
    )
    user = result.scalars().first()

    if not user:
        await session_service.record_failed_login(
            db,
            username_attempted=payload.invite_code,
            reason="invalid_invite",
            method="invite",
            ip=ip,
            user_agent=ua,
            user_id=None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Код приглашения недействителен. Убедитесь, что код введен верно, или что аккаунт не был активирован ранее (в этом случае войдите с помощью пароля или Telegram).",
        )

    token, _session = await session_service.complete_login(
        db,
        user=user,
        login_method="invite",
        ip=ip,
        user_agent=ua,
    )
    return _login_response(user, token)


@router.get("/me")
async def get_me(
    refresh: int = 0,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Получить информацию о текущем авторизованном пользователе.

    При наличии authentik_sub + AUTHENTIK_API_* подтягивает unified profile (имя/аватар)
    из Authentik в локальный кэш.
    """
    result = await db.execute(
        select(User).where(User.username == current_user.username, User.is_deleted == False)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )

    from app.services.unified_profile_service import (
        apply_profile_to_user,
        profile_sync_enabled,
        sync_local_from_idp,
    )

    # Unified profile pull (best-effort; local remains if IdP unreachable)
    # email: no DB column on HRMS — carry from IdP snapshot into response only
    email_out: str | None = None
    if user.authentik_sub and profile_sync_enabled():
        from datetime import datetime, timezone
        from app.core.config import settings

        now = datetime.now(timezone.utc)
        ttl = settings.AUTHENTIK_PROFILE_TTL_SECONDS

        need_pull = True
        if refresh != 1 and ttl > 0 and user.profile_synced_at is not None:
            synced_at = user.profile_synced_at
            if synced_at.tzinfo is None:
                synced_at = synced_at.replace(tzinfo=timezone.utc)
            if (now - synced_at).total_seconds() < ttl:
                need_pull = False

        if need_pull:
            try:
                snapshot = await sync_local_from_idp(
                    authentik_sub=user.authentik_sub,
                    local_full_name=user.full_name,
                    local_avatar_seed=user.avatar_seed,
                    local_locale=user.locale,
                    local_theme=user.theme,
                )
                if snapshot is not None:
                    email_out = snapshot.email
                    apply_profile_to_user(user, snapshot)

                user.profile_synced_at = now
                db.add(user)
                await db.commit()
                await db.refresh(user)
            except Exception:
                # never break /me for profile sync failures
                # negative cache: не спамить упавший IdP
                try:
                    user.profile_synced_at = now
                    db.add(user)
                    await db.commit()
                    await db.refresh(user)
                except Exception:
                    pass

    has_password = (
        user.password_hash is not None and user.password_hash != SSO_BYPASS_HASH
    )
    has_telegram = user.telegram_id is not None
    return {
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
        "email": email_out,
        "locale": user.locale,
        "theme": user.theme,
        "has_telegram": has_telegram,
        "telegram_id": user.telegram_id,
        "telegram_username": user.telegram_username,
        "has_password": has_password,
        "password_changed_at": user.password_changed_at.isoformat() if user.password_changed_at else None,
        # Баннер онбординга: пока не выполнены оба пункта (не зависит от invite_code)
        "needs_security_setup": (not has_password) or (not has_telegram),
        "invite_code": user.invite_code,
        "avatar_seed": user.avatar_seed,
        "authentik_linked": bool(user.authentik_sub),
        "profile_sot": (
            "authentik"
            if (user.authentik_sub and profile_sync_enabled())
            else "local"
        ),
    }


@router.get("/sessions", response_model=list[SessionOut])
async def list_my_sessions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SessionOut]:
    """Список активных (не отозванных, не истёкших) сессий текущего пользователя."""
    user_id = await _resolve_user_id(db, current_user)
    sessions = await session_service.list_sessions(db, user_id=user_id)
    current_sid = current_user.session_id
    return [
        SessionOut(
            id=s.id,
            device_label=s.device_label,
            ip_address=s.ip_address,
            user_agent=s.user_agent,
            login_method=s.login_method,
            created_at=s.created_at,
            last_seen_at=s.last_seen_at,
            is_current=bool(current_sid and s.id == current_sid),
        )
        for s in sessions
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_my_session(
    session_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Отозвать одну сессию (свою)."""
    user_id = await _resolve_user_id(db, current_user)
    try:
        await session_service.revoke_session(
            db,
            user_id=user_id,
            session_id=session_id,
            reason="user_revoke",
        )
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сессия не найдена",
        )
    await session_service.record_login_event(
        db,
        event_type="session_revoke",
        success=True,
        user_id=user_id,
        username_attempted=current_user.username,
        session_id=session_id,
        details={"reason": "user_revoke", "scope": "one"},
    )


@router.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_my_sessions(
    scope: str = Query(default="others", pattern="^(others|all)$"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Отозвать сессии: scope=others (default) или all."""
    user_id = await _resolve_user_id(db, current_user)
    if scope == "all":
        await session_service.revoke_all(
            db, user_id=user_id, reason="user_revoke"
        )
    else:
        await session_service.revoke_others(
            db,
            user_id=user_id,
            current_session_id=current_user.session_id,
            reason="user_revoke",
        )
    await session_service.record_login_event(
        db,
        event_type="session_revoke",
        success=True,
        user_id=user_id,
        username_attempted=current_user.username,
        session_id=current_user.session_id,
        details={"reason": "user_revoke", "scope": scope},
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
    from jose import JWTError, jwt

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = auth_header[7:]
    # Magic Bearer "admin" (dev-only) — nothing to revoke
    if token == "admin":
        if not settings.DEV_BYPASS_AUTH:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return

    try:
        secret_key = settings.JWT_SECRET_KEY or settings.SECRET_KEY
        payload = jwt.decode(token, secret_key, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = payload.get("username") or payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(
        select(User).where(User.username == username, User.is_deleted == False)
    )
    user = result.scalars().first()
    sid_raw = payload.get("sid")
    session_id: UUID | None = None
    if sid_raw:
        try:
            session_id = UUID(str(sid_raw))
        except (ValueError, TypeError):
            session_id = None

    if user is not None and session_id is not None:
        # Soft revoke: ignore missing / already-revoked
        session = await session_service.session_repo.get_by_id(db, session_id)
        if session is not None and session.user_id == user.id and session.revoked_at is None:
            await session_service.session_repo.revoke(db, session_id, "logout")
        await session_service.record_login_event(
            db,
            event_type="logout",
            success=True,
            user_id=user.id,
            username_attempted=username,
            session_id=session_id,
            details={"method": "logout"},
        )


@router.get("/login-events", response_model=list[LoginEventOut])
async def list_my_login_events(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[LoginEventOut]:
    """История входов текущего пользователя (окно retention из settings)."""
    user_id = await _resolve_user_id(db, current_user)
    events = await session_service.list_login_events(db, user_id=user_id, limit=limit)
    out: list[LoginEventOut] = []
    for e in events:
        details = e.details if isinstance(e.details, dict) else {}
        out.append(
            LoginEventOut(
                id=e.id,
                event_type=e.event_type,
                success=e.success,
                ip_address=e.ip_address,
                device_label=device_label_from_ua(e.user_agent),
                login_method=details.get("method") if details else None,
                created_at=e.created_at,
                failure_reason=details.get("reason") if details else None,
            )
        )
    return out
