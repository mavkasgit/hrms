from sqlalchemy import Boolean, Column, Date, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class OrderEmployee(Base):
    __tablename__ = "order_employees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    vacation_start = Column(Date, nullable=False)
    vacation_end = Column(Date, nullable=False)
    vacation_days = Column(Integer, nullable=False)
    reason = Column(Text, nullable=True)

    order = relationship("Order", back_populates="employees")
    employee = relationship("Employee")
