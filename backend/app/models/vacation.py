from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Vacation(Base):
    __tablename__ = "vacations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tab_number = Column(Integer, ForeignKey("employees.tab_number"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    vacation_type = Column(String(50), nullable=False)
    days_count = Column(Integer, nullable=False)
    vacation_year = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="vacations")
