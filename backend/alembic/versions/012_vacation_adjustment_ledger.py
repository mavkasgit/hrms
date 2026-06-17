"""add vacation adjustment ledger tables and transaction fields

Revision ID: 012
Revises: 011
Create Date: 2026-05-06 02:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vacation_adjustments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("vacation_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("adjustment_type", sa.String(length=30), nullable=False),
        sa.Column("original_order_id", sa.Integer(), nullable=False),
        sa.Column("adjustment_order_id", sa.Integer(), nullable=False),
        sa.Column("original_start_date", sa.Date(), nullable=True),
        sa.Column("original_end_date", sa.Date(), nullable=True),
        sa.Column("actual_start_date", sa.Date(), nullable=True),
        sa.Column("actual_end_date", sa.Date(), nullable=True),
        sa.Column("original_days", sa.Integer(), nullable=False),
        sa.Column("actual_days", sa.Integer(), nullable=False),
        sa.Column("days_delta", sa.Integer(), nullable=False),
        sa.Column("days_returned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("days_added", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["adjustment_order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["original_order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["vacation_id"], ["vacations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vacation_id", "adjustment_order_id", name="uq_vacation_adjustment_order"),
    )
    op.create_index("ix_vacation_adjustments_vacation_id", "vacation_adjustments", ["vacation_id"], unique=False)
    op.create_index("ix_vacation_adjustments_employee_id", "vacation_adjustments", ["employee_id"], unique=False)
    op.create_index(
        "ix_vacation_adjustments_original_order_id",
        "vacation_adjustments",
        ["original_order_id"],
        unique=False,
    )
    op.create_index(
        "ix_vacation_adjustments_adjustment_order_id",
        "vacation_adjustments",
        ["adjustment_order_id"],
        unique=False,
    )

    op.create_table(
        "vacation_period_manual_closures",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("work_year_start", sa.Date(), nullable=False),
        sa.Column("work_year_end", sa.Date(), nullable=False),
        sa.Column("days_count", sa.Integer(), nullable=False),
        sa.Column("closure_type", sa.String(length=30), nullable=False, server_default="manual_close"),
        sa.Column("remaining_days", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "employee_id",
            "work_year_start",
            "work_year_end",
            name="uq_manual_closure_work_year",
        ),
    )
    op.create_index(
        "ix_vacation_period_manual_closures_employee_id",
        "vacation_period_manual_closures",
        ["employee_id"],
        unique=False,
    )

    op.add_column(
        "vacation_period_transactions",
        sa.Column("original_order_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "vacation_period_transactions",
        sa.Column("adjustment_order_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "vacation_period_transactions",
        sa.Column("adjustment_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "vacation_period_transactions",
        sa.Column("manual_closure_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "vacation_period_transactions",
        sa.Column("reversed_transaction_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "vacation_period_transactions",
        sa.Column("is_reversal", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "vacation_period_transactions",
        sa.Column("source_type", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "vacation_period_transactions",
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.create_foreign_key(
        "fk_vpt_original_order",
        "vacation_period_transactions",
        "orders",
        ["original_order_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_vpt_adjustment_order",
        "vacation_period_transactions",
        "orders",
        ["adjustment_order_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_vpt_adjustment",
        "vacation_period_transactions",
        "vacation_adjustments",
        ["adjustment_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_vpt_manual_closure",
        "vacation_period_transactions",
        "vacation_period_manual_closures",
        ["manual_closure_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_vpt_reversed_tx",
        "vacation_period_transactions",
        "vacation_period_transactions",
        ["reversed_transaction_id"],
        ["id"],
    )

    op.create_index("ix_vpt_original_order_id", "vacation_period_transactions", ["original_order_id"], unique=False)
    op.create_index(
        "ix_vpt_adjustment_order_id",
        "vacation_period_transactions",
        ["adjustment_order_id"],
        unique=False,
    )
    op.create_index("ix_vpt_adjustment_id", "vacation_period_transactions", ["adjustment_id"], unique=False)
    op.create_index("ix_vpt_manual_closure_id", "vacation_period_transactions", ["manual_closure_id"], unique=False)

    op.execute(
        """
        UPDATE vacation_period_transactions
        SET transaction_type = 'vacation_use'
        WHERE transaction_type = 'auto_use';
        """
    )
    op.execute(
        """
        UPDATE vacation_period_transactions
        SET transaction_type = 'vacation_restore'
        WHERE transaction_type = 'restore';
        """
    )


def downgrade() -> None:
    op.drop_index("ix_vpt_manual_closure_id", table_name="vacation_period_transactions")
    op.drop_index("ix_vpt_adjustment_id", table_name="vacation_period_transactions")
    op.drop_index("ix_vpt_adjustment_order_id", table_name="vacation_period_transactions")
    op.drop_index("ix_vpt_original_order_id", table_name="vacation_period_transactions")

    op.drop_constraint("fk_vpt_reversed_tx", "vacation_period_transactions", type_="foreignkey")
    op.drop_constraint("fk_vpt_manual_closure", "vacation_period_transactions", type_="foreignkey")
    op.drop_constraint("fk_vpt_adjustment", "vacation_period_transactions", type_="foreignkey")
    op.drop_constraint("fk_vpt_adjustment_order", "vacation_period_transactions", type_="foreignkey")
    op.drop_constraint("fk_vpt_original_order", "vacation_period_transactions", type_="foreignkey")

    op.drop_column("vacation_period_transactions", "metadata")
    op.drop_column("vacation_period_transactions", "source_type")
    op.drop_column("vacation_period_transactions", "is_reversal")
    op.drop_column("vacation_period_transactions", "reversed_transaction_id")
    op.drop_column("vacation_period_transactions", "manual_closure_id")
    op.drop_column("vacation_period_transactions", "adjustment_id")
    op.drop_column("vacation_period_transactions", "adjustment_order_id")
    op.drop_column("vacation_period_transactions", "original_order_id")

    op.drop_index(
        "ix_vacation_period_manual_closures_employee_id",
        table_name="vacation_period_manual_closures",
    )
    op.drop_table("vacation_period_manual_closures")

    op.drop_index("ix_vacation_adjustments_adjustment_order_id", table_name="vacation_adjustments")
    op.drop_index("ix_vacation_adjustments_original_order_id", table_name="vacation_adjustments")
    op.drop_index("ix_vacation_adjustments_employee_id", table_name="vacation_adjustments")
    op.drop_index("ix_vacation_adjustments_vacation_id", table_name="vacation_adjustments")
    op.drop_table("vacation_adjustments")
