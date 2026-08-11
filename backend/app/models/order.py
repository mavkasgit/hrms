from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_number: Mapped[str] = mapped_column(String(50), nullable=False)
    order_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("order_types.id"), nullable=False, index=True)
    employee_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), server_default=func.now())
    file_path: Mapped[Optional[str]] = mapped_column(String(255))
    display_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    extra_fields: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False))
    deleted_by: Mapped[Optional[str]] = mapped_column(String(100))

    is_group: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    source_draft_id: Mapped[Optional[str]] = mapped_column(String(255))
    source_draft_created_by: Mapped[Optional[str]] = mapped_column(String(100))

    employee = relationship("Employee", back_populates="orders")
    order_type = relationship("OrderType", back_populates="orders")
    employees = relationship("OrderEmployee", back_populates="order", cascade="all, delete-orphan")


class OrderSequence(Base):
    __tablename__ = "order_sequences"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
