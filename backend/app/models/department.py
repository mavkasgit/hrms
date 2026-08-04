from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.models.base import Base


class RelationType(enum.Enum):
    VERTICAL = "vertical"
    MATRIX = "matrix"
    HORIZONTAL = "horizontal"


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[Optional[str]] = mapped_column(String(50))
    color: Mapped[Optional[str]] = mapped_column(String(7))       # hex цвет, напр #3B82F6
    icon: Mapped[Optional[str]] = mapped_column(String(50))       # имя иконки из lucide-react
    head_employee_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("employees.id"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    head = relationship("Employee", foreign_keys=[head_employee_id])
    employees = relationship("Employee", foreign_keys="Employee.department_id", back_populates="department")
    tags = relationship("DepartmentTag", back_populates="department", cascade="all, delete-orphan")
    head_links = relationship("DepartmentRelation", foreign_keys="DepartmentRelation.head_id",
                              back_populates="head", cascade="all, delete-orphan")
    child_links = relationship("DepartmentRelation", foreign_keys="DepartmentRelation.child_id",
                               back_populates="child", cascade="all, delete-orphan")


class DepartmentRelation(Base):
    __tablename__ = "department_relations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    head_id: Mapped[int] = mapped_column(Integer, ForeignKey("departments.id"), nullable=False, index=True)
    child_id: Mapped[int] = mapped_column(Integer, ForeignKey("departments.id"), nullable=False, index=True)
    relation_type: Mapped[RelationType] = mapped_column(SAEnum(RelationType, values_callable=lambda x: [e.value for e in x]), nullable=False, default=RelationType.VERTICAL)

    head = relationship("Department", foreign_keys=[head_id], back_populates="head_links")
    child = relationship("Department", foreign_keys=[child_id], back_populates="child_links")