"""Add users.profile_sync_failed_at for failed profile pull cooldown

HRMS-parity для ktm2000#49: кулдаун упавших пуллов профиля. Инвариант —
не чаще одной попытки синхронизации профиля в окно TTL, успешной или нет.

Revision ID: 051
Revises: 050
Create Date: 2026-08-08
"""
from alembic import op
import sqlalchemy as sa


revision = "051"
down_revision = "050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("profile_sync_failed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "profile_sync_failed_at")
