"""add edited_at to documents

Revision ID: 027
Revises: 026
Create Date: 2026-05-18 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '027'
down_revision = '026'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "edited_at")
