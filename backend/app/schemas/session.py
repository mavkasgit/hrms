"""Pydantic schemas for user sessions and login events API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

# Сколько последних активных сессий отдаём в GET /auth/sessions
# (канон user-settings 2.0.0: список не раздувается, счётчик — в total).
MAX_SESSIONS_SHOWN = 10


class SessionOut(BaseModel):
    id: UUID
    device_label: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    login_method: str
    created_at: datetime
    last_seen_at: datetime
    is_current: bool = False

    class Config:
        from_attributes = True


class SessionListOut(BaseModel):
    """GET /auth/sessions: последние MAX_SESSIONS_SHOWN сессий по last_seen_at DESC.

    Контракт канона user-settings 2.0.0 (мажор): вместо голого списка — объект
    {sessions: [...], total: N}, чтобы UI показывал «последние N из total».
    """

    sessions: list[SessionOut]
    total: int


class LoginEventOut(BaseModel):
    id: int
    event_type: str
    success: bool
    ip_address: str | None = None
    device_label: str | None = None
    login_method: str | None = None
    created_at: datetime
    failure_reason: str | None = None

    class Config:
        from_attributes = True
