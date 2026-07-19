"""add users.profile_synced_at for profile freshness (P5d)

Revision ID: 041
Revises: 040
Create Date: 2026-07-19 13:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# метка свежести кэша профиля (P5d)
revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("profile_synced_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "profile_synced_at")
