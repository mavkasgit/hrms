from sqlalchemy import Column, Integer, DateTime, ForeignKey, String, Enum, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from enum import Enum as PyEnum

from app.models.base import Base


class TransactionType(str, PyEnum):
    AUTO_USE = "auto_use"
    MANUAL_CLOSE = "manual_close"
    PARTIAL_CLOSE = "partial_close"
    RESTORE = "restore"


class VacationPeriodTransaction(Base):
    __tablename__ = "vacation_period_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    period_id = Column(Integer, ForeignKey("vacation_periods.id", ondelete="CASCADE"), nullable=False, index=True)
    vacation_id = Column(Integer, ForeignKey("vacations.id"), nullable=True)
    order_id = Column(Integer, nullable=True)
    order_number = Column(String, nullable=True)
    days_count = Column(Integer, nullable=False)
    transaction_type = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(String, nullable=True)

    period = relationship("VacationPeriod", back_populates="transactions")
