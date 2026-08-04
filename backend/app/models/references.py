import datetime
from typing import Optional

from sqlalchemy import Integer, String, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PositionVacationConfig(Base):
    __tablename__ = "position_vacation_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    days: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Holiday(Base):
    __tablename__ = "holidays"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[datetime.date] = mapped_column(Date, nullable=False, unique=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(200))
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    is_working_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


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
