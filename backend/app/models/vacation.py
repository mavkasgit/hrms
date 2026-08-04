from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Vacation(Base):
    __tablename__ = "vacations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    vacation_type: Mapped[str] = mapped_column(String(50), nullable=False)
    days_count: Mapped[int] = mapped_column(Integer, nullable=False)
    vacation_year: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[Optional[str]] = mapped_column(String(100))
    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True)

    is_recalled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    recall_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    recall_order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True)
    
    is_postponed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    postpone_order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True)
    
    is_extended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    extension_order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True)

    employee = relationship("Employee", back_populates="vacations")
    order = relationship("Order", foreign_keys=[order_id])
    recall_order = relationship("Order", foreign_keys=[recall_order_id])
    postpone_order = relationship("Order", foreign_keys=[postpone_order_id])
    extension_order = relationship("Order", foreign_keys=[extension_order_id])
