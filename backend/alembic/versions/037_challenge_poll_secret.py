"""add poll_secret_hash to challenges; partial unique on telegram_id/phone

Revision ID: 037
Revises: 036
Create Date: 2026-07-09 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "auth_login_challenges",
        sa.Column("poll_secret_hash", sa.String(length=64), nullable=True),
    )
    # Fresh branch / empty table: backfill empty then enforce NOT NULL for new rows.
    op.execute(
        "UPDATE auth_login_challenges SET poll_secret_hash = '' "
        "WHERE poll_secret_hash IS NULL"
    )
    op.alter_column(
        "auth_login_challenges",
        "poll_secret_hash",
        existing_type=sa.String(length=64),
        nullable=False,
        server_default="",
    )

    # M3: partial unique so soft-deleted users do not block re-link / JIT.
    op.drop_index("ix_users_telegram_id", table_name="users")
    op.drop_index("ix_users_phone", table_name="users")
    op.create_index(
        "ix_users_telegram_id_active",
        "users",
        ["telegram_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )
    op.create_index(
        "ix_users_phone_active",
        "users",
        ["phone"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )


def downgrade() -> None:
    op.drop_index("ix_users_phone_active", table_name="users")
    op.drop_index("ix_users_telegram_id_active", table_name="users")
    op.create_index("ix_users_phone", "users", ["phone"], unique=True)
    op.create_index("ix_users_telegram_id", "users", ["telegram_id"], unique=True)

    op.drop_column("auth_login_challenges", "poll_secret_hash")
