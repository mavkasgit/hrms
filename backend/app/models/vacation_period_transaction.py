from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum as PyEnum

from app.models.base import Base


class TransactionType(str, PyEnum):
    VACATION_USE = "vacation_use"
    VACATION_USE_ADJUSTED = "vacation_use_adjusted"
    RECALCULATE_USE = "recalculate_use"
    VACATION_RESTORE = "vacation_restore"
    MANUAL_CLOSE = "manual_close"
    PARTIAL_CLOSE = "partial_close"


class VacationPeriodTransaction(Base):
    __tablename__ = "vacation_period_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    period_id: Mapped[int] = mapped_column(Integer, ForeignKey("vacation_periods.id", ondelete="CASCADE"), nullable=False, index=True)
    vacation_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("vacations.id"), nullable=True)
    original_order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    adjustment_order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    adjustment_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("vacation_adjustments.id"), nullable=True, index=True)
    manual_closure_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("vacation_period_manual_closures.id"), nullable=True, index=True)
    reversed_transaction_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("vacation_period_transactions.id"), nullable=True)
    is_reversal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    order_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    order_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    days_count: Mapped[int] = mapped_column(Integer, nullable=False)
    transaction_type: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    period = relationship("VacationPeriod", back_populates="transactions")
