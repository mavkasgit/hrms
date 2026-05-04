from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class HireDateAdjustment(Base):
    __tablename__ = "hire_date_adjustments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    adjustment_date = Column(Date, nullable=False)
    reason = Column(String(500), nullable=False)
    created_by = Column(String(100), nullable=False, default="admin")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", foreign_keys=[employee_id])
