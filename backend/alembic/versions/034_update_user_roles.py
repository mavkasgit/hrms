"""update user roles: hr_* → viewer

Старые роли (hr_manager, hr_specialist) сохраняются в users_role_backup,
чтобы downgrade мог их восстановить. Без бэкапа downgrade необратим.

Revision ID: 034
Revises: 033
Create Date: 2026-06-17 00:38:31.651564

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision = '034'
down_revision = '033'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Бэкапим старые роли в отдельную таблицу
    op.create_table(
        "users_role_backup",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("old_role", sa.String(50), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.execute(
        "INSERT INTO users_role_backup (user_id, old_role) "
        "SELECT id, role FROM users WHERE role IN ('hr_manager', 'hr_specialist')"
    )

    # 2. Переводим этих пользователей в 'viewer'
    op.execute("UPDATE users SET role = 'viewer' WHERE role IN ('hr_manager', 'hr_specialist')")

    # 3. Меняем CHECK-ограничение
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_role "
        "CHECK (role IN ('admin', 'viewer'))"
    )


def downgrade() -> None:
    # 1. Возвращаем старое CHECK-ограничение
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_role "
        "CHECK (role IN ('admin', 'hr_manager', 'hr_specialist'))"
    )

    # 2. Восстанавливаем роли из бэкапа (если таблица существует)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "users_role_backup" in inspector.get_table_names():
        op.execute(
            "UPDATE users u "
            "SET role = b.old_role "
            "FROM users_role_backup b "
            "WHERE u.id = b.user_id"
        )
        op.drop_table("users_role_backup")
