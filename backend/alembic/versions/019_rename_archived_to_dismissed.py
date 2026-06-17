"""rename archived columns to dismissed

Revision ID: 019
Revises: 018
Create Date: 2026-05-11

Переименование колонок:
- is_archived → is_dismissed
- archived_by → dismissed_by
- archived_at → dismissed_at
- terminated_date → dismissal_date
- termination_reason → dismissal_reason
"""
from typing import Sequence, Union

from alembic import op

revision: str = '019'
down_revision: Union[str, None] = '018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("employees", "is_archived", new_column_name="is_dismissed")
    op.alter_column("employees", "archived_by", new_column_name="dismissed_by")
    op.alter_column("employees", "archived_at", new_column_name="dismissed_at")
    op.alter_column("employees", "terminated_date", new_column_name="dismissal_date")
    op.alter_column("employees", "termination_reason", new_column_name="dismissal_reason")
    op.drop_index("ix_employees_is_archived", table_name="employees")
    op.create_index("ix_employees_is_dismissed", "employees", ["is_dismissed"])


def downgrade() -> None:
    op.drop_index("ix_employees_is_dismissed", table_name="employees")
    op.create_index("ix_employees_is_archived", "employees", ["is_archived"])
    op.alter_column("employees", "is_dismissed", new_column_name="is_archived")
    op.alter_column("employees", "dismissed_by", new_column_name="archived_by")
    op.alter_column("employees", "dismissed_at", new_column_name="archived_at")
    op.alter_column("employees", "dismissal_date", new_column_name="terminated_date")
    op.alter_column("employees", "dismissal_reason", new_column_name="termination_reason")
