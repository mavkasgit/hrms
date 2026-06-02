from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class ContractHistory(Base):
    __tablename__ = "contract_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    contract_number = Column(String(50), nullable=True)
    contract_start = Column(Date, nullable=False)
    contract_end = Column(Date, nullable=True)
    contract_years = Column(Integer, nullable=True)
    order_type_code = Column(String(100), nullable=False, index=True)
    old_position = Column(String(200), nullable=True)
    new_position = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", back_populates="contract_histories")
    order = relationship("Order")
