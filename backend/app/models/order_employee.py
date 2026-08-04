from datetime import date
from typing import Optional

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class OrderEmployee(Base):
    __tablename__ = "order_employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    vacation_start: Mapped[date] = mapped_column(Date, nullable=False)
    vacation_end: Mapped[date] = mapped_column(Date, nullable=False)
    vacation_days: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    order = relationship("Order", back_populates="employees")
    employee = relationship("Employee")
