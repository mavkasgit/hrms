from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class VacationPlan(Base):
    __tablename__ = "vacation_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False)  # 1-12
    plan_count = Column(String(50), nullable=False)  # "1", "0.5", "1/3"
    comment = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="vacation_plans")

    __table_args__ = (
        UniqueConstraint("employee_id", "year", "month", name="uq_vacation_plan_emp_year_month"),
    )
