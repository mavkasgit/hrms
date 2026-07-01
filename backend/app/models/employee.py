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
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=True, index=True)
    additional_vacation_days = Column(Integer, nullable=False, default=0)
    hire_date = Column(Date)
    birth_date = Column(Date)
    gender = Column(String(1))
    citizenship = Column(Boolean, default=True)
    residency = Column(Boolean, default=True)
    pensioner = Column(Boolean, default=False)
    payment_form = Column(String(50))
    rate = Column(Float)
    employment_type = Column(String(50))
    contract_start = Column(Date)
    contract_end = Column(Date)
    contract_number = Column(String(50), nullable=True)
    personal_number = Column(String(50))
    insurance_number = Column(String(50))
    passport_number = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), server_onupdate=func.now(), onupdate=func.now())

    is_dismissed = Column(Boolean, default=False, nullable=False, index=True)
    dismissal_date = Column(Date)
    dismissal_reason = Column(String(255))
    dismissed_by = Column(String(100))
    dismissed_at = Column(DateTime(timezone=True))

    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime(timezone=True))
    deleted_by = Column(String(100))

    transfers = Column(JSON, nullable=True, default=list)

    vacations = relationship("Vacation", back_populates="employee")
    vacation_periods = relationship("VacationPeriod", back_populates="employee", order_by="VacationPeriod.year_number")
    vacation_plans = relationship("VacationPlan", back_populates="employee")
    orders = relationship("Order", back_populates="employee")
    sick_leaves = relationship("SickLeave", back_populates="employee")
    work_schedules = relationship(
        "WorkSchedule", back_populates="employee", cascade="all, delete-orphan"
    )
    audit_log = relationship("EmployeeAuditLog", back_populates="employee", order_by="EmployeeAuditLog.performed_at.desc()")
    department = relationship("Department", foreign_keys=[department_id], back_populates="employees")
    position = relationship("Position", foreign_keys=[position_id], back_populates="employees")
    tags = relationship("EmployeeTag", back_populates="employee")
    notifications = relationship("Notification", back_populates="employee")
    statements = relationship("Statement", back_populates="employee")
    contract_histories = relationship("ContractHistory", back_populates="employee", order_by="ContractHistory.contract_start.desc()")


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
