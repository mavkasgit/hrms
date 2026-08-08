"""Аварийный (Break Glass) доступ — host-адаптер.

Изолирован от таблицы users и стандартного сервиса входа: проверка по env-конфигу
(BREAK_GLASS_*), сессий не создаёт, аудит пишется в login-events (DB-offline-safe).

Доменные ошибки — через ``HRMSException`` (глобальный хендлер мапит в JSON);
роутер их не ловит.
"""

from __future__ import annotations

import socket
from uuid import UUID, uuid4

import bcrypt
import structlog

from app.core.config import settings
from app.core.database import async_session
from app.core.exceptions import HRMSException
from app.schemas.auth import LoginResponse
from app.services import session_service
from app.services.auth_token import create_access_token as issue_access_token

logger = structlog.get_logger()


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


async def record_break_glass_event(
    event_type: str,
    success: bool,
    username_attempted: str,
    ip_address: str | None,
    user_agent: str | None,
    session_id: UUID | None = None,
    details: dict | None = None,
) -> None:
    """Best-effort аудит break-glass в login-events (не падает при offline БД)."""
    if not _is_db_port_open():
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


async def break_glass_login(
    *,
    password: str,
    ip: str | None,
    user_agent: str | None,
) -> LoginResponse:
    """Аварийный вход по паролю. Не создаёт запись в users и сессию."""
    username = settings.BREAK_GLASS_USER or "emergency_admin"

    if not settings.BREAK_GLASS_ENABLED:
        await record_break_glass_event(
            event_type="login_failure",
            success=False,
            username_attempted=username,
            ip_address=ip,
            user_agent=user_agent,
            details={"source": "emergency_access", "reason": "break_glass_disabled"},
        )
        raise HRMSException(
            "Аварийный доступ отключен",
            error_code="break_glass_disabled",
            status_code=401,
        )

    # Проверка пароля (открытый пароль или bcrypt-хэш)
    password_ok = False
    if settings.BREAK_GLASS_PASSWORD:
        password_ok = password == settings.BREAK_GLASS_PASSWORD
    elif settings.BREAK_GLASS_PASSWORD_HASH:
        try:
            password_ok = bcrypt.checkpw(
                password.encode("utf-8"),
                settings.BREAK_GLASS_PASSWORD_HASH.encode("utf-8"),
            )
        except Exception:
            password_ok = False

    if not password_ok:
        await record_break_glass_event(
            event_type="login_failure",
            success=False,
            username_attempted=username,
            ip_address=ip,
            user_agent=user_agent,
            details={"source": "emergency_access", "reason": "invalid_credentials"},
        )
        structlog.get_logger().warning(
            "Emergency access login failed",
            username=username,
            ip=ip,
            source="emergency_access",
        )
        raise HRMSException(
            "Неверный пароль аварийного доступа",
            error_code="break_glass_invalid_credentials",
            status_code=401,
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

    await record_break_glass_event(
        event_type="login_success",
        success=True,
        username_attempted=username,
        ip_address=ip,
        user_agent=user_agent,
        session_id=session_id,
        details={"source": "emergency_access", "method": "break_glass"},
    )

    structlog.get_logger().critical(
        "EMERGENCY BREAK-GLASS ACCESS ACTIVATED",
        username=username,
        ip=ip,
        user_agent=user_agent,
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
