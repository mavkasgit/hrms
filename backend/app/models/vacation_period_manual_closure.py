from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class VacationPeriodManualClosure(Base):
    __tablename__ = "vacation_period_manual_closures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    work_year_start: Mapped[date] = mapped_column(Date, nullable=False)
    work_year_end: Mapped[date] = mapped_column(Date, nullable=False)
    days_count: Mapped[int] = mapped_column(Integer, nullable=False)
    closure_type: Mapped[str] = mapped_column(String(30), nullable=False, default="manual_close")
    remaining_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    additional_days_at_closure: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "work_year_start",
            "work_year_end",
            name="uq_manual_closure_work_year",
        ),
    )
