"""add group orders support

Revision ID: 20260511_0200
Revises: 20260507_0300_add_cascade_delete_vacation_fks
Create Date: 2026-05-11 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260511_0200"
down_revision: Union[str, None] = "20260511_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Make employee_id nullable
    op.alter_column("orders", "employee_id", existing_type=sa.Integer(), nullable=True)

    # 2. Add is_group column
    op.add_column("orders", sa.Column("is_group", sa.Boolean(), nullable=False, server_default="false"))

    # 3. Create order_employees table
    op.create_table(
        "order_employees",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("vacation_start", sa.Date(), nullable=False),
        sa.Column("vacation_end", sa.Date(), nullable=False),
        sa.Column("vacation_days", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
    )

    # 4. Create indexes
    op.create_index("ix_order_employees_order_id", "order_employees", ["order_id"])
    op.create_index("ix_order_employees_employee_id", "order_employees", ["employee_id"])
    op.create_unique_constraint("uq_order_employees_order_employee", "order_employees", ["order_id", "employee_id"])


def downgrade() -> None:
    op.drop_constraint("uq_order_employees_order_employee", "order_employees")
    op.drop_index("ix_order_employees_employee_id", "order_employees")
    op.drop_index("ix_order_employees_order_id", "order_employees")
    op.drop_table("order_employees")
    op.drop_column("orders", "is_group")
    op.alter_column("orders", "employee_id", existing_type=sa.Integer(), nullable=False)
