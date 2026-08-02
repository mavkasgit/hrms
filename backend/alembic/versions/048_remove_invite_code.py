"""удаление invite_code из users (#35)

Invite-вход удалён (A2): POST /auth/invite/login и POST /users/{id}/generate-invite
отвечают 404, писателей в колонке нет. Колонка invite_code и её уникальный
индекс удаляются из таблицы users.

Revision ID: 048
Revises: 047
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa


revision = '048'
down_revision = '047'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_users_invite_code", table_name="users")
    op.drop_column("users", "invite_code")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("invite_code", sa.String(length=64), nullable=True),
    )
    op.create_index("ix_users_invite_code", "users", ["invite_code"], unique=True)
