from datetime import date
from enum import Enum
from typing import Optional, TYPE_CHECKING

from sqlalchemy import Column, Integer, String, Date, ForeignKey, Index, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.employee import Employee
    from app.models.user import User


class SickLeaveStatus(str, Enum):
    """Статусы больничного листа."""

    ACTIVE = "active"  # Действующий
    CANCELLED = "cancelled"  # Отменен
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

    # Аудит (Кто и когда)
    created_at: Mapped[date] = mapped_column(Date, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    updated_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    # Для soft-delete и отмены
    deleted_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    cancelled_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Relationships
    employee: Mapped["Employee"] = relationship(
        "Employee", back_populates="sick_leaves"
    )
    creator: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by], lazy="joined"
    )
    updater: Mapped["User"] = relationship(
        "User", foreign_keys=[updated_by], lazy="joined"
    )

    # Индексы для оптимизации выборок
    __table_args__ = (
        Index("ix_sick_leaves_employee_dates", "employee_id", "start_date", "end_date"),
        Index("ix_sick_leaves_status_filter", "status", "employee_id"),
    )

    def __repr__(self):
        return f"<SickLeave(id={self.id}, employee_id={self.employee_id}, status={self.status})>"
