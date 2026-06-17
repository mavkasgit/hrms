"""fix vacation_calendar file paths to be relative to STAFFING_PATH

Revision ID: 022
Revises: 021
Create Date: 2026-05-12 03:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '022'
down_revision = '021'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    result = conn.execute(sa.text(
        "SELECT id, file_path FROM documents WHERE doc_code = 'vacation_calendar'"
    ))
    rows = result.fetchall()

    for doc_id, file_path in rows:
        # Remove vacation_calendar/ or vacation_calendar\ prefix
        for prefix in ['vacation_calendar/', 'vacation_calendar\\']:
            if file_path.startswith(prefix):
                relative_path = file_path[len(prefix):]
                # Normalize backslashes to forward slashes
                relative_path = relative_path.replace('\\', '/')
                conn.execute(
                    sa.text("UPDATE documents SET file_path = :path WHERE id = :id"),
                    {"path": relative_path, "id": doc_id}
                )
                break


def downgrade() -> None:
    pass
