from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class InternalNotification(Base):
    """Внутреннее уведомление в интерфейсе (не кадровый документ).

    Живёт до закрытия пользователем: есть дата прочтения и дата закрытия.
    Уведомление адресуется конкретному пользователю (user_id) с индивидуальной
    отметкой прочтения/закрытия — см. тикет #18.
    """

    __tablename__ = "internal_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Кому адресовано
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Тип события (order_changed, import_finished, backup_error, ...)
    notification_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Ссылка на объект: тип + id (например, employee + 123), навигация по клику
    entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User")

    __table_args__ = (
        Index("ix_internal_notifications_user_unclosed", "user_id", "closed_at"),
        Index(
            "ix_internal_notifications_dedup",
            "notification_type",
            "entity_type",
            "entity_id",
            "user_id",
        ),
    )

    def __repr__(self) -> str:
        return f"<InternalNotification(id={self.id}, user={self.user_id}, type={self.notification_type})>"
