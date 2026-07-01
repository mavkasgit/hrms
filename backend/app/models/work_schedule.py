from datetime import date, time
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import (
    Column, Integer, String, Date, ForeignKey, Boolean, Text, Index, UniqueConstraint, Time
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.employee import Employee


class WorkSchedule(Base):
    """Плановый график работы сотрудника на конкретный месяц."""

    __tablename__ = "work_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )

    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    is_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    approved_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    approved_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    created_at = Column(Date, nullable=False, default=date.today)
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    updated_at = Column(Date, nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    employee: Mapped["Employee"] = relationship("Employee", back_populates="work_schedules")
    entries: Mapped[List["WorkScheduleEntry"]] = relationship(
        "WorkScheduleEntry",
        back_populates="schedule",
        cascade="all, delete-orphan",
        order_by="WorkScheduleEntry.work_date",
    )

    __table_args__ = (
        UniqueConstraint("employee_id", "year", "month", name="uq_work_schedule_employee_period"),
        Index("ix_work_schedules_period", "year", "month"),
    )

    def __repr__(self) -> str:
        return f"<WorkSchedule(id={self.id}, emp={self.employee_id}, {self.year}-{self.month:02d})>"


class WorkScheduleEntry(Base):
    """Один день планового графика: дата + тип смены + комментарий.

    Тип смены — код из фиксированного каталога (см. app.core.shift_types).
    Не FK в БД: список типов фиксирован, миграция на добавление типа не нужна.
    """

    __tablename__ = "work_schedule_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("work_schedules.id", ondelete="CASCADE"), nullable=False, index=True
    )

    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    shift_type_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)

    planned_hours_override: Mapped[Optional[float]] = mapped_column(nullable=True)

    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    schedule: Mapped["WorkSchedule"] = relationship("WorkSchedule", back_populates="entries")

    __table_args__ = (
        UniqueConstraint("schedule_id", "work_date", name="uq_schedule_entry_date"),
    )

    def __repr__(self) -> str:
        return f"<WorkScheduleEntry(id={self.id}, date={self.work_date}, code={self.shift_type_code})>"
