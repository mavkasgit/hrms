"""Server-side user session (hybrid JWT + session row; JWT claim `sid` = id)."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class UserSession(Base):
    """Active/revoked login session for multi-device revoke and last-seen tracking."""

    __tablename__ = "user_sessions"
    __table_args__ = (
        Index("ix_user_sessions_user_id_revoked_at", "user_id", "revoked_at"),
        Index("ix_user_sessions_expires_at", "expires_at"),
        # Lookup активной сессии по IdP sid (back-channel logout корреляция)
        Index(
            "ix_user_sessions_oidc_sid",
            "oidc_sid",
            postgresql_where=text("oidc_sid IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # logout | user_revoke | admin | expired | backchannel_logout
    revoke_reason: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # e.g. "Google Chrome (Windows)" — server-side UA parse
    device_label: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    # oidc | break_glass
    login_method: Mapped[str] = mapped_column(String(32), nullable=False)
    # sid claim из id_token (OIDC Back-Channel Logout корреляция); NULL для не-OIDC входов
    oidc_sid: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    user = relationship("User", lazy="select")
