from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class PositionVacationConfig(Base):
    __tablename__ = "position_vacation_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position = Column(String(100), nullable=False, unique=True, index=True)
    days = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Holiday(Base):
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    year = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


def get_default_holidays(year: int) -> list[dict]:
    """Стандартные праздники РБ для любого года"""
    return [
        {"date": f"{year}-01-01", "name": "Новый год", "year": year},
        {"date": f"{year}-01-02", "name": "Новый год", "year": year},
        {"date": f"{year}-01-07", "name": "Рождество Христово (православное)", "year": year},
        {"date": f"{year}-03-08", "name": "День женщин", "year": year},
        {"date": f"{year}-05-01", "name": "Праздник труда", "year": year},
        {"date": f"{year}-05-09", "name": "День Победы", "year": year},
        {"date": f"{year}-07-03", "name": "День Независимости", "year": year},
        {"date": f"{year}-11-07", "name": "День Октябрьской революции", "year": year},
        {"date": f"{year}-12-25", "name": "Рождество Христово (католическое)", "year": year},
    ]
