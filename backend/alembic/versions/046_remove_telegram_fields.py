"""удаление telegram-полей пользователей (#34)

Revision ID: 046
Revises: 045
Create Date: 2026-08-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '046'
down_revision = '045'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Таблицы Telegram-подсистемы (bot challenge + replay protection)
    op.drop_index("ix_auth_login_challenges_token", table_name="auth_login_challenges")
    op.drop_table("auth_login_challenges")

    op.drop_index(
        op.f("ix_used_telegram_signatures_created_at"),
        table_name="used_telegram_signatures",
    )
    op.drop_table("used_telegram_signatures")

    # 2. Индексы и колонки telegram_* в users
    op.drop_index(op.f("ix_users_telegram_id"), table_name="users")
    op.drop_index("ix_users_telegram_id_active", table_name="users")
    op.drop_column("users", "telegram_username")
    op.drop_column("users", "telegram_id")


def downgrade() -> None:
    # 2. Возврат колонок и индексов telegram_* в users
    op.add_column(
        "users", sa.Column("telegram_id", sa.BigInteger(), nullable=True)
    )
    op.add_column(
        "users", sa.Column("telegram_username", sa.String(length=100), nullable=True)
    )
    op.create_index(op.f("ix_users_telegram_id"), "users", ["telegram_id"], unique=False)
    op.create_index(
        "ix_users_telegram_id_active",
        "users",
        ["telegram_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )

    # 1. Возврат таблиц Telegram-подсистемы
    op.create_table(
        "used_telegram_signatures",
        sa.Column("signature_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("signature_hash"),
    )
    op.create_index(
        op.f("ix_used_telegram_signatures_created_at"),
        "used_telegram_signatures",
        ["created_at"],
        unique=False,
    )

    op.create_table(
        "auth_login_challenges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("purpose", sa.String(length=16), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("telegram_id", sa.BigInteger(), nullable=True),
        sa.Column("telegram_username", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "poll_secret_hash", sa.String(length=64), nullable=False, server_default=""
        ),
    )
    op.create_index(
        "ix_auth_login_challenges_token",
        "auth_login_challenges",
        ["token"],
        unique=True,
    )
