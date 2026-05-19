from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    number = Column(String(50), nullable=True)
    date = Column(Date, nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    notification_type_id = Column(Integer, ForeignKey("notification_types.id"), nullable=True, index=True)
    content = Column(Text, nullable=True)
    extra_fields = Column(JSON, nullable=True)
    file_path = Column(String(500), nullable=True)
    is_draft = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=False), server_default=func.now())
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="notifications")
    notification_type = relationship("NotificationType", back_populates="notifications")
