from datetime import date, datetime
from enum import Enum
from typing import Optional, TYPE_CHECKING

from sqlalchemy import Integer, String, Date, DateTime, ForeignKey, Index, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.employee import Employee


class SickLeaveStatus(str, Enum):
    """Статусы больничного листа."""

    ACTIVE = "active"  # Действующий
    DELETED = "deleted"  # Удален (soft delete)


class SickLeave(Base):
    __tablename__ = "sick_leaves"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Сотрудник
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id"), nullable=False, index=True
    )

    # Даты
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Статус
    status: Mapped[SickLeaveStatus] = mapped_column(
        SQLEnum(
            SickLeaveStatus,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=SickLeaveStatus.ACTIVE,
        nullable=False,
        index=True,
    )

    # Аудит (Кто и когда). Provenance по identity-строке (username/break-glass);
    # created_by/updated_by/deleted_by — необязательный FK на users.id (заполняется
    # только для реальных пользователей, см. #110).
    created_at: Mapped[date] = mapped_column(Date, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_by_identity: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )

    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    updated_by_identity: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )

    # Для soft-delete
    deleted_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    deleted_by_identity: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )

    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Relationships
    employee: Mapped["Employee"] = relationship(
        "Employee", back_populates="sick_leaves"
    )

    # Индексы для оптимизации выборок
    __table_args__ = (
        Index("ix_sick_leaves_employee_dates", "employee_id", "start_date", "end_date"),
        Index("ix_sick_leaves_status_filter", "status", "employee_id"),
    )

    def __repr__(self):
        return f"<SickLeave(id={self.id}, employee_id={self.employee_id}, status={self.status})>"
