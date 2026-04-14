from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class RelationType(enum.Enum):
    VERTICAL = "vertical"
    MATRIX = "matrix"
    HORIZONTAL = "horizontal"


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    short_name = Column(String(50))
    color = Column(String(7))       # hex цвет, напр #3B82F6
    icon = Column(String(50))       # имя иконки из lucide-react
    head_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    rank = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    head = relationship("Employee", foreign_keys=[head_employee_id])
    employees = relationship("Employee", foreign_keys="Employee.department_id", back_populates="department")
    tags = relationship("DepartmentTag", back_populates="department", cascade="all, delete-orphan")
    head_links = relationship("DepartmentRelation", foreign_keys="DepartmentRelation.head_id",
                              back_populates="head", cascade="all, delete-orphan")
    child_links = relationship("DepartmentRelation", foreign_keys="DepartmentRelation.child_id",
                               back_populates="child", cascade="all, delete-orphan")


class DepartmentRelation(Base):
    __tablename__ = "department_relations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    head_id = Column(Integer, ForeignKey("departments.id"), nullable=False, index=True)
    child_id = Column(Integer, ForeignKey("departments.id"), nullable=False, index=True)
    relation_type = Column(SAEnum(RelationType, values_callable=lambda x: [e.value for e in x]), nullable=False, default=RelationType.VERTICAL)

    head = relationship("Department", foreign_keys=[head_id], back_populates="head_links")
    child = relationship("Department", foreign_keys=[child_id], back_populates="child_links")