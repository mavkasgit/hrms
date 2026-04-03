from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Employee(Base):
    __tablename__ = "employees"

    tab_number = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, index=True)
    department = Column(String(100), nullable=False, index=True)
    position = Column(String(100), nullable=False)
    hire_date = Column(Date)
    birth_date = Column(Date)
    gender = Column(String(1))
    citizenship = Column(Boolean, default=True)
    residency = Column(Boolean, default=True)
    pensioner = Column(Boolean, default=False)
    payment_form = Column(String(50))
    rate = Column(Float)
    contract_start = Column(Date)
    contract_end = Column(Date)
    personal_number = Column(String(50))
    insurance_number = Column(String(50))
    passport_number = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    vacations = relationship("Vacation", back_populates="employee", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="employee", cascade="all, delete-orphan")
