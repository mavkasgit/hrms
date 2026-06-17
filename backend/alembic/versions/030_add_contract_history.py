"""add contract_history table

Revision ID: 030
Revises: 029
Create Date: 2026-06-01 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '030'
down_revision = '029'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "contract_history" not in existing_tables:
        op.create_table(
            "contract_history",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("employee_id", sa.Integer(), nullable=False),
            sa.Column("order_id", sa.Integer(), nullable=True),
            sa.Column("contract_number", sa.String(length=50), nullable=True),
            sa.Column("contract_start", sa.Date(), nullable=False),
            sa.Column("contract_end", sa.Date(), nullable=True),
            sa.Column("contract_years", sa.Integer(), nullable=True),
            sa.Column("order_type_code", sa.String(length=100), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        )
        op.create_index(op.f("ix_contract_history_employee_id"), "contract_history", ["employee_id"], unique=False)
        op.create_index(op.f("ix_contract_history_order_id"), "contract_history", ["order_id"], unique=False)
        op.create_index(op.f("ix_contract_history_order_type_code"), "contract_history", ["order_type_code"], unique=False)
        op.create_foreign_key("fk_contract_history_employee_id", "contract_history", "employees", ["employee_id"], ["id"])
        op.create_foreign_key("fk_contract_history_order_id", "contract_history", "orders", ["order_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_contract_history_order_id", "contract_history", type_="foreignkey")
    op.drop_constraint("fk_contract_history_employee_id", "contract_history", type_="foreignkey")
    op.drop_index(op.f("ix_contract_history_order_type_code"), table_name="contract_history")
    op.drop_index(op.f("ix_contract_history_order_id"), table_name="contract_history")
    op.drop_index(op.f("ix_contract_history_employee_id"), table_name="contract_history")
    op.drop_table("contract_history")
