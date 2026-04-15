from sqlalchemy import Column, Integer, Date, DateTime, ForeignKey, String
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class VacationPeriod(Base):
    __tablename__ = "vacation_periods"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    main_days = Column(Integer, nullable=False, default=24)
    additional_days = Column(Integer, nullable=False, default=0)
    used_days = Column(Integer, nullable=False, default=0)
    
    used_days_auto = Column(Integer, nullable=False, default=0)
    used_days_manual = Column(Integer, nullable=False, default=0)
    order_ids = Column(String, nullable=True)
    
    year_number = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="vacation_periods")
