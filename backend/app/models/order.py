from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_number = Column(String(50), nullable=False)
    order_type_id = Column(Integer, ForeignKey("order_types.id"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    order_date = Column(Date, nullable=False)
    created_date = Column(DateTime(timezone=False), server_default=func.now())
    file_path = Column(String(255))
    notes = Column(Text)
    extra_fields = Column(JSON, nullable=True)

    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime(timezone=False))
    deleted_by = Column(String(100))

    is_cancelled = Column(Boolean, default=False, nullable=False, index=True)
    cancelled_at = Column(DateTime(timezone=False))
    cancelled_by = Column(String(100))

    employee = relationship("Employee", back_populates="orders")
    order_type = relationship("OrderType", back_populates="orders")


class OrderSequence(Base):
    __tablename__ = "order_sequences"

    year = Column(Integer, primary_key=True)
    last_number = Column(Integer, nullable=False, default=0)
