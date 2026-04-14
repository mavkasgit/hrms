from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    color = Column(String(7))       # hex цвет
    icon = Column(String(50))       # имя иконки из lucide-react
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employees = relationship("Employee", foreign_keys="Employee.position_id", back_populates="position")