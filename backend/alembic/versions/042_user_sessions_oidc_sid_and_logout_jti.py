"""user_sessions.oidc_sid + used_logout_jti (OIDC back-channel SLO, phase 1)

Revision ID: 042
Revises: 041
Create Date: 2026-07-20 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# oidc_sid — sid claim из id_token: корреляция back-channel logout
# с конкретной сессией (а не revoke всех сессий пользователя).
# used_logout_jti — replay-защита logout_token по jti (OIDC Back-Channel Logout 1.0).
revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column("oidc_sid", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_user_sessions_oidc_sid",
        "user_sessions",
        ["oidc_sid"],
        postgresql_where=sa.text("oidc_sid IS NOT NULL"),
    )

    op.create_table(
        "used_logout_jti",
        sa.Column("jti", sa.String(length=255), primary_key=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_used_logout_jti_expires_at", "used_logout_jti", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_used_logout_jti_expires_at", table_name="used_logout_jti")
    op.drop_table("used_logout_jti")
    op.drop_index("ix_user_sessions_oidc_sid", table_name="user_sessions")
    op.drop_column("user_sessions", "oidc_sid")
