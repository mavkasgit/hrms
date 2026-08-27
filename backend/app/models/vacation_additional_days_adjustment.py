from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class VacationAdditionalDaysAdjustment(Base):
    """Запись изменения доп. дней отпуска сотрудника.

    Диапазонные правки (apply_additional_days_increase) хранят границу
    effective_from и формируют границу синхронизации: периоды старее
    effective_from не перезаписываются значением из карточки сотрудника.

    Точечные правки (adjust_periods_additional_days) помечаются
    is_period_edit=True и НЕ участвуют в границе синхронизации (get_latest
    их игнорирует) — они нужны только для истории изменений (#123).
    """

    __tablename__ = "vacation_additional_days_adjustments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    old_value: Mapped[int] = mapped_column(Integer, nullable=False)
    new_value: Mapped[int] = mapped_column(Integer, nullable=False)
    is_period_edit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", foreign_keys=[employee_id])