from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # Hex color (#RRGGBB)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employees = relationship("EmployeeTag", back_populates="tag")
    departments = relationship("DepartmentTag", back_populates="tag")


class EmployeeTag(Base):
    __tablename__ = "employee_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    tag_id: Mapped[int] = mapped_column(Integer, ForeignKey("tags.id"), nullable=False, index=True)
    assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", back_populates="tags")
    tag = relationship("Tag", back_populates="employees")

    __table_args__ = (
        UniqueConstraint("employee_id", "tag_id", name="uq_employee_tag"),
    )


class DepartmentTag(Base):
    __tablename__ = "department_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    department_id: Mapped[int] = mapped_column(Integer, ForeignKey("departments.id"), nullable=False, index=True)
    tag_id: Mapped[int] = mapped_column(Integer, ForeignKey("tags.id"), nullable=False, index=True)
    assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    department = relationship("Department", back_populates="tags")
    tag = relationship("Tag", back_populates="departments")

    __table_args__ = (
        UniqueConstraint("department_id", "tag_id", name="uq_department_tag"),
    )