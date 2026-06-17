"""remove cancelled status from sick leaves

Revision ID: 024
Revises: 023
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa


revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update cancelled records to deleted first
    op.execute("UPDATE sick_leaves SET status = 'deleted' WHERE status = 'cancelled'")

    # Drop the column we don't need
    op.drop_column('sick_leaves', 'cancelled_by')

    # Default старого enum-типа нужно снять до смены типа колонки.
    op.execute("ALTER TABLE sick_leaves ALTER COLUMN status DROP DEFAULT")

    # Recreate enum without 'cancelled'
    op.execute("ALTER TYPE sickleavestatus RENAME TO sickleavestatus_old")
    sa.Enum("active", "deleted", name="sickleavestatus").create(op.get_bind())
    op.execute(
        "ALTER TABLE sick_leaves ALTER COLUMN status TYPE sickleavestatus "
        "USING status::text::sickleavestatus"
    )
    op.execute("ALTER TABLE sick_leaves ALTER COLUMN status SET DEFAULT 'active'::sickleavestatus")
    op.execute("DROP TYPE sickleavestatus_old")


def downgrade() -> None:
    # Add column back
    op.add_column('sick_leaves', sa.Column('cancelled_by', sa.Integer(), nullable=True))

    # Аналогично снимаем default перед обратной сменой enum-типа.
    op.execute("ALTER TABLE sick_leaves ALTER COLUMN status DROP DEFAULT")

    # Recreate old enum with cancelled
    op.execute("ALTER TYPE sickleavestatus RENAME TO sickleavestatus_old")
    sa.Enum("active", "cancelled", "deleted", name="sickleavestatus").create(op.get_bind())
    op.execute(
        "ALTER TABLE sick_leaves ALTER COLUMN status TYPE sickleavestatus "
        "USING status::text::sickleavestatus"
    )
    op.execute("ALTER TABLE sick_leaves ALTER COLUMN status SET DEFAULT 'active'::sickleavestatus")
    op.execute("DROP TYPE sickleavestatus_old")
