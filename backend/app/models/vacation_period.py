from datetime import date, datetime
from typing import Optional

from sqlalchemy import Integer, Date, DateTime, ForeignKey, String
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class VacationPeriod(Base):
    __tablename__ = "vacation_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    main_days: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    additional_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    used_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    used_days_auto: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    used_days_manual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    remaining_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Явно сохранённый остаток (для закрытых периодов)
    order_ids: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # ID приказов для связей в БД
    order_numbers: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Номера приказов для отображения
    order_days_map: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # JSON: {"87": 18, "88": 5, "89": 20}
    
    year_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="vacation_periods")
    transactions = relationship("VacationPeriodTransaction", back_populates="period", order_by="VacationPeriodTransaction.created_at", cascade="all, delete-orphan")

    def is_closed(self) -> bool:
        """Закрыт ли период: полный остаток 0.

        Единый источник правила «открыт/закрыт». Не зависит от отображения
        (остаток «на дату»/начислено): закрыт только когда все доступные дни
        либо израсходованы отпусками (used >= total), либо закрыты вручную
        (manual/partial_close с остатком 0). Частично закрытый (остаток > 0) — не закрыт.
        """
        total = (self.main_days or 0) + (self.additional_days or 0)
        used = self.used_days or 0
        if self.remaining_days is not None:
            return self.remaining_days <= 0
        return used >= total
