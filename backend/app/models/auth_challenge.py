import uuid

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class AuthLoginChallenge(Base):
    """One-time login/link challenge for Telegram bot deep-link flow."""

    __tablename__ = "auth_login_challenges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token = Column(String(64), unique=True, nullable=False, index=True)
    purpose = Column(String(16), nullable=False)  # login | link
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(16), nullable=False, default="pending", server_default="pending")
    telegram_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
