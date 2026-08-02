"""Shared JWT access-token helper for password and SSO login."""

import time
from uuid import UUID

from jose import jwt

from app.core.config import settings


def create_access_token(
    username: str,
    role: str,
    full_name: str,
    session_id: UUID | str | None = None,
) -> str:
    """Создать JWT-токен с claims: sub, username, full_name, hrms_access_level, exp[, sid]."""
    expire = time.time() + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    payload = {
        "sub": username,
        "username": username,
        "full_name": full_name,
        "hrms_access_level": role,
        "exp": int(expire),
    }
    if session_id is not None:
        payload["sid"] = str(session_id)
    secret_key = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    return jwt.encode(payload, secret_key, algorithm=settings.ALGORITHM)
