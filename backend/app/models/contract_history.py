from datetime import date, datetime
from typing import Optional

from sqlalchemy import Integer, String, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class ContractHistory(Base):
    __tablename__ = "contract_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    contract_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    contract_start: Mapped[date] = mapped_column(Date, nullable=False)
    contract_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    contract_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    order_type_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    old_position: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    new_position: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", back_populates="contract_histories")
    order = relationship("Order")
