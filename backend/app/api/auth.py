from datetime import datetime, timezone
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
import bcrypt
from jose import jwt
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, async_session
from app.models.user import User
from app.api.deps import get_current_user, CurrentUser
from app.schemas.oidc_auth import (
    OidcCallbackRequest,
    OidcConfigResponse,
    OidcLogoutUrlResponse,
)
from app.schemas.session import (
    LoginEventListOut,
    LoginEventOut,
    MAX_LOGIN_EVENTS_SHOWN,
    MAX_SESSIONS_SHOWN,
    SessionListOut,
    SessionOut,
)
from app.services import session_service
from app.services.auth_token import create_access_token as issue_access_token
from app.services.oidc_auth_service import OidcAuthService
from app.services.session_service import SessionNotFoundError
from app.utils.client_ip import get_client_ip
from app.utils.user_agent import device_label_from_ua

router = APIRouter(prefix="/auth", tags=["auth"])


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
    if getattr(current_user, "is_break_glass", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Операция недоступна для учетной записи аварийного доступа",
        )
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



import socket


def _is_db_port_open() -> bool:
    try:
        from urllib.parse import urlparse
        url_str = settings.DATABASE_URL
        if "+asyncpg" in url_str:
            url_str = url_str.replace("postgresql+asyncpg://", "http://")
        elif "postgresql://" in url_str:
            url_str = url_str.replace("postgresql://", "http://")
        parsed = urlparse(url_str)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 5432
        with socket.create_connection((host, port), timeout=0.1):
            return True
    except Exception:
        return False


async def _safe_record_break_glass_event(
    event_type: str,
    success: bool,
    username_attempted: str,
    ip_address: str | None,
    user_agent: str | None,
    session_id: UUID | None = None,
    details: dict | None = None,
):
    if not _is_db_port_open():
        import structlog
        structlog.get_logger().warning(
            "Skipping break-glass database audit record (Database is offline)",
            source="emergency_access",
        )
        return

    db = async_session()
    try:
        await session_service.record_login_event(
            db,
            event_type=event_type,
            success=success,
            username_attempted=username_attempted,
            ip_address=ip_address,
            user_agent=user_agent,
            session_id=session_id,
            details=details,
        )
        await db.commit()
    except Exception as exc:
        import structlog
        structlog.get_logger().warning(
            "Could not save break-glass login event to database",
            error=str(exc),
            source="emergency_access",
        )
    finally:
        try:
            await db.close()
        except BaseException:
            pass


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
    username = settings.BREAK_GLASS_USER or "emergency_admin"

    if not settings.BREAK_GLASS_ENABLED:
        await _safe_record_break_glass_event(
            event_type="login_failure",
            success=False,
            username_attempted=username,
            ip_address=ip,
            user_agent=ua,
            details={"source": "emergency_access", "reason": "break_glass_disabled"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Аварийный доступ отключен",
        )

    # Проверка пароля (открытый пароль или bcrypt-хэш)
    password_ok = False
    if settings.BREAK_GLASS_PASSWORD:
        password_ok = (payload.password == settings.BREAK_GLASS_PASSWORD)
    elif settings.BREAK_GLASS_PASSWORD_HASH:
        try:
            password_ok = bcrypt.checkpw(
                payload.password.encode("utf-8"),
                settings.BREAK_GLASS_PASSWORD_HASH.encode("utf-8"),
            )
        except Exception:
            password_ok = False

    if not password_ok:
        await _safe_record_break_glass_event(
            event_type="login_failure",
            success=False,
            username_attempted=username,
            ip_address=ip,
            user_agent=ua,
            details={"source": "emergency_access", "reason": "invalid_credentials"},
        )
        import structlog
        structlog.get_logger().warning(
            "Emergency access login failed",
            username=username,
            ip=ip,
            source="emergency_access",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный пароль аварийного доступа",
        )

    # Успешный вход
    session_id = uuid4()
    token = issue_access_token(
        username,
        role="admin",
        full_name=username,
        claims={"role": "admin", "is_break_glass": True},
        session_id=session_id,
    )

    await _safe_record_break_glass_event(
        event_type="login_success",
        success=True,
        username_attempted=username,
        ip_address=ip,
        user_agent=ua,
        session_id=session_id,
        details={"source": "emergency_access", "method": "break_glass"},
    )

    import structlog
    structlog.get_logger().critical(
        "EMERGENCY BREAK-GLASS ACCESS ACTIVATED",
        username=username,
        ip=ip,
        user_agent=ua,
        session_id=str(session_id),
        source="emergency_access",
    )

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        username=username,
        role="admin",
        full_name="Emergency Access Admin",
    )


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
    if getattr(current_user, "is_break_glass", False):
        return {
            "username": current_user.username,
            "role": "admin",
            "full_name": current_user.full_name or "Emergency Access Admin",
            "email": None,
            "locale": "ru",
            "theme": "light",
            "avatar_seed": "emergency",
            "authentik_linked": False,
            "profile_sot": "local",
            "is_break_glass": True,
        }

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
        ensure_profile_fresh,
        profile_sync_enabled,
    )

    # Unified profile pull (best-effort; local remains if IdP unreachable).
    # email: no DB column on HRMS; ensure_profile_fresh не отдаёт snapshot —
    # клиент читает email опционально (канон user-settings).
    await ensure_profile_fresh(db, user, refresh=(refresh == 1))

    return {
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
        "email": None,
        "locale": user.locale,
        "theme": user.theme,
        "avatar_seed": user.avatar_seed,
        "authentik_linked": bool(user.authentik_sub),
        "profile_sot": (
            "authentik"
            if (user.authentik_sub and profile_sync_enabled())
            else "local"
        ),
    }


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _load_me_user(db: AsyncSession, username: str) -> User:
    result = await db.execute(
        select(User).where(User.username == username, User.is_deleted == False)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


@router.patch("/me/avatar")
async def update_my_avatar(
    payload: AvatarSeedUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Установить или сбросить avatar_seed. При SSO — пишет в Authentik attributes."""
    from app.services import unified_profile_service as ups
    from app.services.authentik_client import AuthentikAdminError

    user = await _load_me_user(db, current_user.username)

    if user.authentik_sub and ups.profile_sync_enabled():
        try:
            remote = await ups.push_profile_by_sub(
                user.authentik_sub,
                avatar_seed=payload.avatar_seed,
            )
            user.avatar_seed = remote.avatar_seed
            if remote.full_name:
                user.full_name = remote.full_name
            user.profile_synced_at = _utcnow()
        except AuthentikAdminError as exc:
            raise HTTPException(
                status_code=exc.status_code or 502,
                detail=exc.message,
            ) from exc
    else:
        user.avatar_seed = payload.avatar_seed

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"avatar_seed": user.avatar_seed, "full_name": user.full_name}


@router.patch("/me/profile")
async def update_my_profile(
    payload: ProfileUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Обновить display-профиль (locale / theme). SoT = Authentik.

    ФИО и email — read-only для пользователя (канон user-settings 2.0.0):
    они задаются администратором IdP, приложение только читает и кэширует.
    Попытка изменить → 403. Аватар редактируется через отдельный
    ``PATCH /auth/me/avatar``.
    """
    from app.services import unified_profile_service as ups
    from app.services.authentik_client import AuthentikAdminError

    user = await _load_me_user(db, current_user.username)

    if payload.full_name is not None or payload.email is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Изменение ФИО/email недоступно, обратитесь к администратору",
        )

    has_any = payload.locale is not None or payload.theme is not None
    if not has_any:
        return {
            "full_name": user.full_name,
            "avatar_seed": user.avatar_seed,
            "email": None,
            "locale": user.locale,
            "theme": user.theme,
        }

    want_locale = payload.locale
    want_theme = payload.theme

    email_out: str | None = None

    if user.authentik_sub and ups.profile_sync_enabled():
        try:
            remote = await ups.push_profile_by_sub(
                user.authentik_sub,
                locale=want_locale,
                theme=want_theme,
            )
            if remote.full_name:
                user.full_name = remote.full_name
            if want_locale is not None:
                user.locale = remote.locale or want_locale
            if want_theme is not None:
                user.theme = remote.theme or want_theme
            email_out = remote.email
            user.profile_synced_at = _utcnow()
        except AuthentikAdminError as exc:
            raise HTTPException(
                status_code=exc.status_code or 502,
                detail=exc.message,
            ) from exc
    else:
        if want_locale is not None:
            user.locale = want_locale
        if want_theme is not None:
            user.theme = want_theme
        # email: no local column in HRMS — only via IdP

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {
        "full_name": user.full_name,
        "avatar_seed": user.avatar_seed,
        "email": email_out,
        "locale": user.locale,
        "theme": user.theme,
    }


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
    events = await _list_my_login_events(db, current_user)
    return LoginEventListOut(
        events=events[:MAX_LOGIN_EVENTS_SHOWN],
        total=len(events),
    )


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
    user_id = await _resolve_user_id(db, current_user)
    sessions = await session_service.list_sessions(db, user_id=user_id)
    current_sid = current_user.session_id
    out = [
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
    return SessionListOut(sessions=out[:MAX_SESSIONS_SHOWN], total=len(out))


@router.delete("/sessions/others", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_other_sessions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Отозвать все остальные сессии (кроме текущей). Каноничный путь."""
    user_id = await _resolve_user_id(db, current_user)
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
        details={"reason": "user_revoke", "scope": "others"},
    )


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

    if payload.get("is_break_glass") is True:
        sid_raw = payload.get("sid")
        session_id = UUID(str(sid_raw)) if sid_raw else None
        await session_service.record_login_event(
            db,
            event_type="logout",
            success=True,
            user_id=None,
            username_attempted=username,
            session_id=session_id,
            details={"source": "emergency_access", "method": "break_glass"},
        )
        return

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


async def _list_my_login_events(
    db: AsyncSession,
    current_user: CurrentUser,
) -> list[LoginEventOut]:
    user_id = await _resolve_user_id(db, current_user)
    events = await session_service.list_login_events(db, user_id=user_id)
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
