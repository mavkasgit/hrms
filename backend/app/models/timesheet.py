from datetime import date, datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import (
    Column, Integer, String, Date, DateTime, Float, ForeignKey, Text, Index, UniqueConstraint
)
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.employee import Employee


class TimesheetImport(Base):
    """Метаданные одной загрузки турникетного журнала (для версионирования)."""

    __tablename__ = "timesheet_imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    file_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Период, за который загружен файл
    period_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    period_end: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Название подразделения из шапки файла
    department_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Количество строк, распознанных как сотрудники
    employees_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    employees_matched: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    employees_unmatched: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    entries_imported: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Путь к сохранённому файлу (относительно staffing path)
    stored_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Статус
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="completed", index=True)

    # Заметки
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    uploaded_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Если откатили — заполняется
    rolled_back_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rolled_back_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    entries: Mapped[List["TimesheetEntry"]] = relationship(
        "TimesheetEntry",
        back_populates="import_record",
        cascade="all, delete-orphan",
    )
    unmatched_rows = relationship(
        "TimesheetUnmatchedRow",
        back_populates="import_record",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<TimesheetImport(id={self.id}, file='{self.file_name}', "
            f"{self.period_start} - {self.period_end})>"
        )


class TimesheetEntry(Base):
    """Один день фактической выработки сотрудника."""

    __tablename__ = "timesheet_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    import_id: Mapped[int] = mapped_column(
        ForeignKey("timesheet_imports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    employee_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Часы
    presence_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    work_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    absence_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    debt_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    night_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    overtime_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Подразделение/должность из файла (для трассировки)
    department_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    position_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    schedule_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Если запись пришла из файла, но сотрудник не был распознан
    raw_last_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    raw_first_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    raw_patronymic: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    raw_tab_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    import_record: Mapped["TimesheetImport"] = relationship(
        "TimesheetImport", back_populates="entries"
    )

    __table_args__ = (
        # Одна фактическая запись на сотрудника на конкретный день в пределах одного импорта
        UniqueConstraint(
            "import_id", "employee_id", "work_date",
            name="uq_timesheet_entry_per_employee_date",
        ),
        Index("ix_timesheet_employee_date", "employee_id", "work_date"),
    )

    def __repr__(self) -> str:
        return f"<TimesheetEntry(id={self.id}, emp={self.employee_id}, date={self.work_date})>"


class TimesheetUnmatchedRow(Base):
    """Сотрудники, которых не удалось сопоставить при импорте."""

    __tablename__ = "timesheet_unmatched_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    import_id: Mapped[int] = mapped_column(
        ForeignKey("timesheet_imports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    last_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    patronymic: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tab_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    department_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    position_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    schedule_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Сопоставление, сделанное пользователем после импорта
    matched_employee_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )

    import_record: Mapped["TimesheetImport"] = relationship(
        "TimesheetImport", back_populates="unmatched_rows"
    )

    def __repr__(self) -> str:
        return (
            f"<TimesheetUnmatchedRow(id={self.id}, name='{self.last_name} {self.first_name}', "
            f"tab={self.tab_number})>"
        )
