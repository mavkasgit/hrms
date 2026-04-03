from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tab_number = Column(Integer, nullable=True, unique=True, index=True)
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

    is_archived = Column(Boolean, default=False, nullable=False, index=True)
    terminated_date = Column(Date)
    termination_reason = Column(String(255))
    archived_by = Column(String(100))
    archived_at = Column(DateTime(timezone=True))

    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime(timezone=True))
    deleted_by = Column(String(100))

    vacations = relationship("Vacation", back_populates="employee")
    orders = relationship("Order", back_populates="employee")
    audit_log = relationship("EmployeeAuditLog", back_populates="employee", order_by="EmployeeAuditLog.performed_at.desc()")


class EmployeeAuditLog(Base):
    __tablename__ = "employee_audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    action = Column(String(50), nullable=False)
    changed_fields = Column(JSON)
    performed_by = Column(String(100))
    performed_at = Column(DateTime(timezone=True), server_default=func.now())
    reason = Column(String(255))

    employee = relationship("Employee", back_populates="audit_log")
