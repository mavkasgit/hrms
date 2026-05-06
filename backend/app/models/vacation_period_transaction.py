from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
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

    id = Column(Integer, primary_key=True, autoincrement=True)
    period_id = Column(Integer, ForeignKey("vacation_periods.id", ondelete="CASCADE"), nullable=False, index=True)
    vacation_id = Column(Integer, ForeignKey("vacations.id"), nullable=True)
    original_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    adjustment_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    adjustment_id = Column(Integer, ForeignKey("vacation_adjustments.id"), nullable=True, index=True)
    manual_closure_id = Column(Integer, ForeignKey("vacation_period_manual_closures.id"), nullable=True, index=True)
    reversed_transaction_id = Column(Integer, ForeignKey("vacation_period_transactions.id"), nullable=True)
    is_reversal = Column(Boolean, nullable=False, default=False)
    source_type = Column(String(30), nullable=True)
    order_id = Column(Integer, nullable=True)
    order_number = Column(String, nullable=True)
    days_count = Column(Integer, nullable=False)
    transaction_type = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    details = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(String, nullable=True)

    period = relationship("VacationPeriod", back_populates="transactions")
