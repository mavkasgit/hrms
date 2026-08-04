from datetime import date, datetime
from typing import Optional

from sqlalchemy import Integer, String, Float, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tab_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    position_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("positions.id"), nullable=True, index=True)
    additional_vacation_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hire_date: Mapped[Optional[date]] = mapped_column(Date)
    birth_date: Mapped[Optional[date]] = mapped_column(Date)
    gender: Mapped[Optional[str]] = mapped_column(String(1))
    citizenship: Mapped[Optional[bool]] = mapped_column(Boolean, default=True)
    residency: Mapped[Optional[bool]] = mapped_column(Boolean, default=True)
    pensioner: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)
    payment_form: Mapped[Optional[str]] = mapped_column(String(50))
    rate: Mapped[Optional[float]] = mapped_column(Float)
    employment_type: Mapped[Optional[str]] = mapped_column(String(50))
    contract_start: Mapped[Optional[date]] = mapped_column(Date)
    contract_end: Mapped[Optional[date]] = mapped_column(Date)
    contract_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    personal_number: Mapped[Optional[str]] = mapped_column(String(50))
    insurance_number: Mapped[Optional[str]] = mapped_column(String(50))
    passport_number: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), server_onupdate=func.now(), onupdate=func.now())

    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    dismissal_date: Mapped[Optional[date]] = mapped_column(Date)
    dismissal_reason: Mapped[Optional[str]] = mapped_column(String(255))
    dismissed_by: Mapped[Optional[str]] = mapped_column(String(100))
    dismissed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[Optional[str]] = mapped_column(String(100))

    transfers: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, default=list)

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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    changed_fields: Mapped[Optional[list]] = mapped_column(JSON)
    performed_by: Mapped[Optional[str]] = mapped_column(String(100))
    performed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reason: Mapped[Optional[str]] = mapped_column(String(255))

    employee = relationship("Employee", back_populates="audit_log")
