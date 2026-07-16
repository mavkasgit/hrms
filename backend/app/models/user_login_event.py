"""Append-only login / session security events (audit trail)."""

from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class UserLoginEvent(Base):
    """Audit row for login success/failure, logout, session revoke."""

    __tablename__ = "user_login_events"
    __table_args__ = (
        Index("ix_user_login_events_user_id_created_at", "user_id", "created_at"),
        Index("ix_user_login_events_created_at", "created_at"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # For failures when user is unknown or for display of attempted username
    username_attempted = Column(String(255), nullable=True)
    # login_success | login_failure | logout | session_revoke
    event_type = Column(String(32), nullable=False)
    success = Column(Boolean, nullable=False)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    session_id = Column(UUID(as_uuid=True), nullable=True)
    # e.g. {"reason": "invalid_credentials", "method": "password"}
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", lazy="select")
