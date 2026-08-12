"""JWT access-token helper — thin HRMS host shim over the shared session_core.

The actual issuance lives in app/services/session_core.py (must-match across
HRMS/KTM). This file only adapts the legacy ``app.services.auth_token`` API
surface (claims: full_name, hrms_access_level) so existing callers and tests
keep working.
"""

from uuid import UUID

from app.services.session_core import (
    create_access_token as _core_create_access_token,
)
from app.services.session_service import jwt_config


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
        jwt_config(),
        username,
        claims=base,
        session_id=session_id,
    )
