"""telegram and invite auth fields and tables

Revision ID: 036
Revises: 035
Create Date: 2026-07-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Добавляем колонки в таблицу users
    op.add_column("users", sa.Column("telegram_id", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("telegram_username", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("phone", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("invite_code", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("avatar_seed", sa.String(length=64), nullable=True))

    # 2. Создаем уникальный индекс для invite_code
    op.create_index("ix_users_invite_code", "users", ["invite_code"], unique=True)

    # 3. Создаем обычные индексы на users (для foreign key/поиска)
    op.create_index(op.f("ix_users_phone"), "users", ["phone"], unique=False)
    op.create_index(op.f("ix_users_telegram_id"), "users", ["telegram_id"], unique=False)

    # 4. Создаем уникальные частичные индексы на users (для исключения конфликтов у удаленных пользователей)
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

    # 5. Заменяем полный уникальный индекс на username частичным уникальным (не мешает удаленным пользователям)
    op.drop_index("ix_users_username", table_name="users")
    op.create_index(
        "ix_users_username_active",
        "users",
        ["username"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )

    # 6. Создаем таблицу auth_login_challenges
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
        sa.Column("poll_secret_hash", sa.String(length=64), nullable=False, server_default=""),
    )
    op.create_index(
        "ix_auth_login_challenges_token",
        "auth_login_challenges",
        ["token"],
        unique=True,
    )

    # 7. Создаем таблицу used_telegram_signatures (telegram replay protection)
    op.create_table(
        "used_telegram_signatures",
        sa.Column("signature_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("signature_hash"),
    )
    op.create_index(
        op.f("ix_used_telegram_signatures_created_at"),
        "used_telegram_signatures",
        ["created_at"],
        unique=False,
    )

    # 8. Создаем индексы на timesheet и work_schedules таблицы (для консистентности автогенератора)
    op.create_index(op.f('ix_timesheet_entries_id'), 'timesheet_entries', ['id'], unique=False)
    op.create_index(op.f('ix_timesheet_imports_id'), 'timesheet_imports', ['id'], unique=False)
    op.create_index(op.f('ix_timesheet_unmatched_rows_id'), 'timesheet_unmatched_rows', ['id'], unique=False)
    op.create_index(op.f('ix_work_schedule_entries_id'), 'work_schedule_entries', ['id'], unique=False)
    op.create_index(op.f('ix_work_schedules_id'), 'work_schedules', ['id'], unique=False)

    # 9. Таблица system_settings (key-value для админских настроек: токен бота и т.п.)
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=100), primary_key=True, nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_by", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    # 9. Удаляем таблицу system_settings
    op.drop_table("system_settings")

    # 8. Удаляем индексы на timesheet и work_schedules таблицы
    op.drop_index(op.f('ix_work_schedules_id'), table_name='work_schedules')
    op.drop_index(op.f('ix_work_schedule_entries_id'), table_name='work_schedule_entries')
    op.drop_index(op.f('ix_timesheet_unmatched_rows_id'), table_name='timesheet_unmatched_rows')
    op.drop_index(op.f('ix_timesheet_imports_id'), table_name='timesheet_imports')
    op.drop_index(op.f('ix_timesheet_entries_id'), table_name='timesheet_entries')

    # 7. Удаляем таблицу used_telegram_signatures
    op.drop_index(op.f("ix_used_telegram_signatures_created_at"), table_name="used_telegram_signatures")
    op.drop_table("used_telegram_signatures")

    # 6. Удаляем таблицу auth_login_challenges
    op.drop_index("ix_auth_login_challenges_token", table_name="auth_login_challenges")
    op.drop_table("auth_login_challenges")

    # 5. Возвращаем обычный уникальный индекс на username
    op.drop_index("ix_users_username_active", table_name="users")
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # 4. Удаляем частичные и обычные индексы на users
    op.drop_index("ix_users_phone_active", table_name="users")
    op.drop_index("ix_users_telegram_id_active", table_name="users")
    op.drop_index(op.f("ix_users_telegram_id"), table_name="users")
    op.drop_index(op.f("ix_users_phone"), table_name="users")
    op.drop_index("ix_users_invite_code", table_name="users")

    # 1. Удаляем колонки из таблицы users
    op.drop_column("users", "invite_code")
    op.drop_column("users", "phone_verified_at")
    op.drop_column("users", "phone")
    op.drop_column("users", "telegram_username")
    op.drop_column("users", "telegram_id")
    op.drop_column("users", "avatar_seed")
