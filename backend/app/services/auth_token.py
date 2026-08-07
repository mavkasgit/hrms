"""JWT access-token helper — thin HRMS host shim over the shared session_core.

The actual issuance lives in app/services/session_core.py (must-match across
HRMS/KTM). This file only adapts the legacy ``app.services.auth_token`` API
surface (claims: full_name, hrms_access_level) so existing callers and tests
keep working.
"""

from uuid import UUID

from app.core.config import settings
from app.services.session_core import (
    JwtConfig,
    create_access_token as _core_create_access_token,
)


def _jwt_config() -> JwtConfig:
    return JwtConfig(
        secret_key=settings.JWT_SECRET_KEY or settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
        default_ttl_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )


def create_access_token(
    username: str,
    role: str,
    full_name: str,
    session_id: UUID | str | None = None,
    *,
    claims: dict | None = None,
) -> str:
    """Создать JWT-токен с claims: sub, username, full_name, hrms_access_level, exp[, sid]."""
    base: dict = {"full_name": full_name, "hrms_access_level": role}
    if claims:
        base.update(claims)
    return _core_create_access_token(
        _jwt_config(),
        username,
        claims=base,
        session_id=session_id,
    )
