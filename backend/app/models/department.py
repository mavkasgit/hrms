from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    short_name = Column(String(50))
    parent_id = Column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    head_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    parent = relationship("Department", remote_side=[id], backref="children")
    head = relationship("Employee", foreign_keys=[head_employee_id])
    employees = relationship("Employee", foreign_keys="Employee.department_id", back_populates="department")