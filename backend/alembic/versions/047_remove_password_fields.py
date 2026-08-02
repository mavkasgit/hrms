"""удаление парольного хранилища users (#36)

Локальных паролей в HRMS больше нет: вход — OIDC (Authentik) + break-glass
(проверка по env-конфигу, вне таблицы users). Колонки password_hash и
password_changed_at удаляются.

Revision ID: 047
Revises: 046
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa


revision = '047'
down_revision = '046'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("users", "password_hash")
    op.drop_column("users", "password_changed_at")


def downgrade() -> None:
    # server_default — sentinel «пароль не задан»: NOT NULL-колонка на
    # непустой таблице без значения не восстанавливается.
    op.add_column(
        "users",
        sa.Column(
            "password_changed_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "password_hash",
            sa.String(length=255),
            nullable=False,
            server_default="sso_bypass_hash",
        ),
    )
