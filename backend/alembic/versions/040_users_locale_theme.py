"""add users.locale and users.theme for unified profile cache

Revision ID: 040
Revises: 039
Create Date: 2026-07-19 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("locale", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("theme", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "theme")
    op.drop_column("users", "locale")
