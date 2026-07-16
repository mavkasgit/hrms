"""Pydantic schemas for user sessions and login events API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


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
