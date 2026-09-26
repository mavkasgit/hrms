"""vacation_periods: убрать order_days_map (write-only мусор)

Колонка order_days_map писалась в add_used_days, но читалась только в
remove_used_days — функции, удалённой как мёртвый код. Она не участвовала
в recompute_period_totals, поэтому копилась рассинхронизированной с журналом
транзакций: записи удалённых приказов оставались лежать в JSON.

Сколько дней списал приказ, теперь однозначно берётся из
vacation_period_transactions (журнал — источник истины для used_days_auto).

Revision ID: 057
Revises: 056
Create Date: 2026-09-26

"""
from alembic import op
import sqlalchemy as sa


revision = "057"
down_revision = "056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("vacation_periods", "order_days_map")


def downgrade() -> None:
    op.add_column("vacation_periods", sa.Column("order_days_map", sa.String(), nullable=True))
