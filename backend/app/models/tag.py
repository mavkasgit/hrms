from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employees = relationship("EmployeeTag", back_populates="tag")


class EmployeeTag(Base):
    __tablename__ = "employee_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=False, index=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", back_populates="tags")
    tag = relationship("Tag", back_populates="employees")

    __table_args__ = (
        UniqueConstraint("employee_id", "tag_id", name="uq_employee_tag"),
    )