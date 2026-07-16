"""Server-side user session (hybrid JWT + session row; JWT claim `sid` = id)."""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class UserSession(Base):
    """Active/revoked login session for multi-device revoke and last-seen tracking."""

    __tablename__ = "user_sessions"
    __table_args__ = (
        Index("ix_user_sessions_user_id_revoked_at", "user_id", "revoked_at"),
        Index("ix_user_sessions_expires_at", "expires_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    # logout | user_revoke | password_change | admin | expired
    revoke_reason = Column(String(32), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    # e.g. "Google Chrome (Windows)" — server-side UA parse
    device_label = Column(String(128), nullable=True)
    # password | invite | telegram_widget | telegram_bot | oidc
    login_method = Column(String(32), nullable=False)

    user = relationship("User", lazy="select")
