"""add users.authentik_sub for OIDC/Authentik bridge

Revision ID: 039
Revises: 038
Create Date: 2026-07-16 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("authentik_sub", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_users_authentik_sub", "users", ["authentik_sub"])
    # Partial unique: active rows only, non-null authentik_sub
    op.create_index(
        "ix_users_authentik_sub_active",
        "users",
        ["authentik_sub"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false AND authentik_sub IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_users_authentik_sub_active", table_name="users")
    op.drop_index("ix_users_authentik_sub", table_name="users")
    op.drop_column("users", "authentik_sub")
