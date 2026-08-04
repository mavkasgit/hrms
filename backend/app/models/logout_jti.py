"""Replay-защита OIDC back-channel logout_token (jti одноразовый, OIDC BCP)."""

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UsedLogoutJti(Base):
    """Потреблённые jti logout_token; строка живёт до exp токена, затем чистится."""

    __tablename__ = "used_logout_jti"

    jti: Mapped[str] = mapped_column(String(255), primary_key=True)
    # exp из logout_token — после этого момента replay невозможен, строку можно удалить
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
