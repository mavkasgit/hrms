from sqlalchemy import Column, DateTime, String
from sqlalchemy.sql import func

from app.models.base import Base


class UsedTelegramSignature(Base):
    __tablename__ = "used_telegram_signatures"

    signature_hash = Column(String(64), primary_key=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
        index=True,
    )
