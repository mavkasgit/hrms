"""Partial unique index (order_id, employee_id) on vacations

Железная защита от дублей отпусков (#64/#67): не более одной записи отпуска
на пару (приказ, сотрудник). Index частичный (WHERE order_id IS NOT NULL),
чтобы не мешать отпускам без приказа.

ВАЖНО: применяется ТОЛЬКО после прогона скрипта дедупликации
`backend/scripts/dedup_vacations.py --apply` — иначе создание уникального
индекса упадёт на существующих дублях.

Revision ID: 050
Revises: 049
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa


revision = "050"
down_revision = "049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_vacations_order_employee",
        "vacations",
        ["order_id", "employee_id"],
        unique=True,
        postgresql_where=sa.text("order_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_vacations_order_employee", table_name="vacations")
