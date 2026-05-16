from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Vacation(Base):
    __tablename__ = "vacations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    vacation_type = Column(String(50), nullable=False)
    days_count = Column(Integer, nullable=False)
    vacation_year = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime(timezone=True))
    deleted_by = Column(String(100))
    comment = Column(String(500), nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)

    is_recalled = Column(Boolean, default=False, nullable=False, index=True)
    recall_date = Column(Date, nullable=True)
    recall_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    
    is_postponed = Column(Boolean, default=False, nullable=False, index=True)
    postpone_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    
    is_extended = Column(Boolean, default=False, nullable=False, index=True)
    extension_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)

    employee = relationship("Employee", back_populates="vacations")
    order = relationship("Order", foreign_keys=[order_id])
    recall_order = relationship("Order", foreign_keys=[recall_order_id])
    postpone_order = relationship("Order", foreign_keys=[postpone_order_id])
    extension_order = relationship("Order", foreign_keys=[extension_order_id])
