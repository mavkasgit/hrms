from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class VacationAdjustment(Base):
    __tablename__ = "vacation_adjustments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vacation_id: Mapped[int] = mapped_column(Integer, ForeignKey("vacations.id"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    adjustment_type: Mapped[str] = mapped_column(String(30), nullable=False)
    original_order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    adjustment_order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False, index=True)

    original_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    original_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    original_days: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_days: Mapped[int] = mapped_column(Integer, nullable=False)
    days_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    days_returned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    days_added: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    vacation = relationship("Vacation", foreign_keys=[vacation_id])
    original_order = relationship("Order", foreign_keys=[original_order_id])
    adjustment_order = relationship("Order", foreign_keys=[adjustment_order_id])

    __table_args__ = (
        UniqueConstraint("vacation_id", "adjustment_order_id", name="uq_vacation_adjustment_order"),
    )
