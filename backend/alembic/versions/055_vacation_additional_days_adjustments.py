"""additional_days_adjustments + closure snapshot (#123)

Две связанные правки схемы для управления доп. днями отпуска:

1. Новая таблица vacation_additional_days_adjustments — история изменений
   доп. дней отпуска сотрудника (с какого периода применяется, старое/новое
   значение, причина, автор). Последняя запись задаёт границу синхронизации:
   периоды старее effective_from не перезаписываются значением из карточки.

2. Колонка additional_days_at_closure в vacation_period_manual_closures —
   снапшот дополнительных дней на момент закрытия периода. Нужен, чтобы при
   пересоздании периодов (recalculate_periods) восстановление ручного
   закрытия не «проглатывало» дельту выросших доп. дней (см. #123).

Revision ID: 055
Revises: 054
Create Date: 2026-08-27

"""
from alembic import op
import sqlalchemy as sa


revision = "055"
down_revision = "054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vacation_additional_days_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False, index=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("old_value", sa.Integer(), nullable=False),
        sa.Column("new_value", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )

    op.add_column(
        "vacation_period_manual_closures",
        sa.Column("additional_days_at_closure", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("vacation_period_manual_closures", "additional_days_at_closure")
    op.drop_table("vacation_additional_days_adjustments")