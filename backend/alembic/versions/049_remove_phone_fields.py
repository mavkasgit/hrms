"""удаление телефонной аутентификации из users (хвост 036)

Телефонный вход добавлен миграцией 036 (вместе с telegram/invite) и удалён
только в её downgrade. Активный код phone не использует: писателей нет,
get_by_phone нигде не вызывается. Колонки phone/phone_verified_at и
индексы ix_users_phone / ix_users_phone_active удаляются.

Revision ID: 049
Revises: 048
Create Date: 2026-08-03
"""
from alembic import op
import sqlalchemy as sa


revision = '049'
down_revision = '048'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(op.f("ix_users_phone_active"), table_name="users")
    op.drop_index(op.f("ix_users_phone"), table_name="users")
    op.drop_column("users", "phone_verified_at")
    op.drop_column("users", "phone")


def downgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(length=32), nullable=True))
    op.add_column(
        "users",
        sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_users_phone"), "users", ["phone"], unique=False)
    op.create_index(
        "ix_users_phone_active",
        "users",
        ["phone"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )
