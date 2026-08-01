"""users.is_active — fail-closed OIDC role sync

Добавляет users.is_active (default true). При OIDC-логине если claim
hrms_role отсутствует или no_access — пользователь деактивируется (fail-closed).

Revision ID: 043
Revises: 042
Create Date: 2026-07-29 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = '043'
down_revision = '042'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "is_active")
