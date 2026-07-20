"""Replay-защита OIDC back-channel logout_token (jti одноразовый, OIDC BCP)."""

from sqlalchemy import Column, DateTime, String

from app.models.base import Base


class UsedLogoutJti(Base):
    """Потреблённые jti logout_token; строка живёт до exp токена, затем чистится."""

    __tablename__ = "used_logout_jti"

    jti = Column(String(255), primary_key=True)
    # exp из logout_token — после этого момента replay невозможен, строку можно удалить
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
