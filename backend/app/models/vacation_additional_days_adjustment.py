from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class VacationAdditionalDaysAdjustment(Base):
    """Запись изменения доп. дней отпуска сотрудника.

    Хранит, с какого периода (effective_from) применяется новое значение
    дополнительных дней, старое/новое значение, причину и автора. Последняя
    запись задаёт границу синхронизации в ensure_periods_for_employee:
    периоды старее effective_from не перезаписываются значением из карточки
    сотрудника (см. #123).
    """

    __tablename__ = "vacation_additional_days_adjustments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    old_value: Mapped[int] = mapped_column(Integer, nullable=False)
    new_value: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", foreign_keys=[employee_id])