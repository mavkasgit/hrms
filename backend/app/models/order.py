from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_number = Column(String(50), nullable=False)
    order_type = Column(String(50), nullable=False)
    tab_number = Column(Integer, ForeignKey("employees.tab_number"), nullable=False)
    order_date = Column(Date, nullable=False)
    created_date = Column(DateTime(timezone=True), server_default=func.now())
    file_path = Column(String(255))
    notes = Column(Text)

    employee = relationship("Employee", back_populates="orders")


class OrderSequence(Base):
    __tablename__ = "order_sequences"

    year = Column(Integer, primary_key=True)
    last_number = Column(Integer, nullable=False, default=0)
