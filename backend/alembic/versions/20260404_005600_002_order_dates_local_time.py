"""change order date columns to local time (without timezone)

Revision ID: 002_order_dates_local_time
Revises: 001_initial_schema
Create Date: 2026-04-04
"""
from alembic import op

revision = "002_order_dates_local_time"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE orders ALTER COLUMN created_date TYPE TIMESTAMP WITHOUT TIME ZONE")
    op.execute("ALTER TABLE orders ALTER COLUMN deleted_at TYPE TIMESTAMP WITHOUT TIME ZONE")


def downgrade() -> None:
    op.execute("ALTER TABLE orders ALTER COLUMN created_date TYPE TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE orders ALTER COLUMN deleted_at TYPE TIMESTAMP WITH TIME ZONE")
