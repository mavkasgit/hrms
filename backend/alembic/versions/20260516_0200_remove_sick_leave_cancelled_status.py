"""remove cancelled status from sick leaves

Revision ID: 20260516_0200
Revises: 20260516_0100
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa


revision = '20260516_0200'
down_revision = '20260516_0100'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update cancelled records to deleted first
    op.execute("UPDATE sick_leaves SET status = 'deleted' WHERE status = 'cancelled'")

    # Drop the column we don't need
    op.drop_column('sick_leaves', 'cancelled_by')

    # Recreate enum without 'cancelled'
    op.execute("ALTER TYPE sickleavestatus RENAME TO sickleavestatus_old")
    sa.Enum("active", "deleted", name="sickleavestatus").create(op.get_bind())
    op.execute(
        "ALTER TABLE sick_leaves ALTER COLUMN status TYPE sickleavestatus "
        "USING status::text::sickleavestatus"
    )
    op.execute("DROP TYPE sickleavestatus_old")


def downgrade() -> None:
    # Add column back
    op.add_column('sick_leaves', sa.Column('cancelled_by', sa.Integer(), nullable=True))

    # Recreate old enum with cancelled
    op.execute("ALTER TYPE sickleavestatus RENAME TO sickleavestatus_old")
    sa.Enum("active", "cancelled", "deleted", name="sickleavestatus").create(op.get_bind())
    op.execute(
        "ALTER TABLE sick_leaves ALTER COLUMN status TYPE sickleavestatus "
        "USING status::text::sickleavestatus"
    )
    op.execute("DROP TYPE sickleavestatus_old")
