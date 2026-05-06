from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.models.base import Base


class VacationPeriodManualClosure(Base):
    __tablename__ = "vacation_period_manual_closures"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    work_year_start = Column(Date, nullable=False)
    work_year_end = Column(Date, nullable=False)
    days_count = Column(Integer, nullable=False)
    closure_type = Column(String(30), nullable=False, default="manual_close")
    remaining_days = Column(Integer, nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    reason = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "work_year_start",
            "work_year_end",
            name="uq_manual_closure_work_year",
        ),
    )
