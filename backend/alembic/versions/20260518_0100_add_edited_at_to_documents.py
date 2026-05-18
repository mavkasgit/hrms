"""add edited_at to documents

Revision ID: 20260518_0100
Revises: 20260516_0400
Create Date: 2026-05-18 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260518_0100"
down_revision = "20260516_0400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "edited_at")
