from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class VacationAdjustment(Base):
    __tablename__ = "vacation_adjustments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vacation_id = Column(Integer, ForeignKey("vacations.id"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    adjustment_type = Column(String(30), nullable=False)
    original_order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    adjustment_order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)

    original_start_date = Column(Date, nullable=True)
    original_end_date = Column(Date, nullable=True)
    actual_start_date = Column(Date, nullable=True)
    actual_end_date = Column(Date, nullable=True)

    original_days = Column(Integer, nullable=False)
    actual_days = Column(Integer, nullable=False)
    days_delta = Column(Integer, nullable=False)
    days_returned = Column(Integer, nullable=False, default=0)
    days_added = Column(Integer, nullable=False, default=0)

    reason = Column(Text, nullable=True)
    details = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    vacation = relationship("Vacation", foreign_keys=[vacation_id])
    original_order = relationship("Order", foreign_keys=[original_order_id])
    adjustment_order = relationship("Order", foreign_keys=[adjustment_order_id])

    __table_args__ = (
        UniqueConstraint("vacation_id", "adjustment_order_id", name="uq_vacation_adjustment_order"),
    )
