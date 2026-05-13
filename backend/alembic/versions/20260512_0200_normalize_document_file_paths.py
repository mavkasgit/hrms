"""normalize document file_paths to relative paths

Revision ID: 20260512_0200
Revises: 20260512_0100
Create Date: 2026-05-12 02:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '20260512_0200'
down_revision = '20260512_0100'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Convert absolute paths to relative paths (relative to STAFFING_PATH)
    # Docker: /app/data/staffing/children/file.xlsx -> children/file.xlsx
    # Docker: /app/data/staffing/file.xlsx -> file.xlsx
    # Windows: C:/.../data/staffing/children/file.xlsx -> children/file.xlsx
    conn = op.get_bind()

    # Get all documents
    result = conn.execute(sa.text("SELECT id, file_path FROM documents"))
    rows = result.fetchall()

    for doc_id, file_path in rows:
        # Skip if already relative (doesn't start with / or drive letter)
        if not file_path.startswith('/') and (len(file_path) <= 1 or file_path[1] != ':'):
            # But if it starts with 'staffing/', remove the prefix
            if file_path.startswith('staffing/'):
                relative_path = file_path[len('staffing/'):]
                conn.execute(
                    sa.text("UPDATE documents SET file_path = :path WHERE id = :id"),
                    {"path": relative_path, "id": doc_id}
                )
            continue

        # Extract relative path: find 'staffing/' in the path and take what's after it
        staffing_marker = 'staffing/'
        staffing_idx = file_path.find(staffing_marker)
        if staffing_idx >= 0:
            relative_path = file_path[staffing_idx + len(staffing_marker):]
            conn.execute(
                sa.text("UPDATE documents SET file_path = :path WHERE id = :id"),
                {"path": relative_path, "id": doc_id}
            )


def downgrade() -> None:
    # Cannot reliably reverse - leave as is
    pass
