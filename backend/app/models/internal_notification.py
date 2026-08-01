from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class InternalNotification(Base):
    """Внутреннее уведомление в интерфейсе (не кадровый документ).

    Живёт до закрытия пользователем: есть дата прочтения и дата закрытия.
    Уведомление адресуется конкретному пользователю (user_id) с индивидуальной
    отметкой прочтения/закрытия — см. тикет #18.
    """

    __tablename__ = "internal_notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Кому адресовано
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Тип события (order_changed, import_finished, backup_error, ...)
    notification_type = Column(String(50), nullable=False, index=True)

    title = Column(String(255), nullable=False)
    text = Column(Text, nullable=True)

    # Ссылка на объект: тип + id (например, employee + 123), навигация по клику
    entity_type = Column(String(50), nullable=True, index=True)
    entity_id = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)

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
