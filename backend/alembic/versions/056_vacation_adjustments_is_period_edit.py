"""adjustments: is_period_edit для точечных правок (#123)

Точечные правки доп. дней по конкретным периодам
(adjust_periods_additional_days) пишутся в ту же таблицу
vacation_additional_days_adjustments с флагом is_period_edit=True,
чтобы попадать в историю изменений, но НЕ сдвигать границу синхронизации
(ensure_periods_for_employee берёт границу только из диапазонных записей
с is_period_edit=False).

Revision ID: 056
Revises: 055
Create Date: 2026-08-27

"""
from alembic import op
import sqlalchemy as sa


revision = "056"
down_revision = "055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vacation_additional_days_adjustments",
        sa.Column("is_period_edit", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("vacation_additional_days_adjustments", "is_period_edit")