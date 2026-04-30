"""normalize file storage paths

Revision ID: 7a1f2d9c6b4e
Revises: 3c89895478dc
Create Date: 2026-04-30 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7a1f2d9c6b4e"
down_revision: Union[str, None] = "3c89895478dc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    _normalize_table_paths(conn, "orders", "orders")
    _normalize_table_paths(conn, "staffing_documents", "staffing")


def downgrade() -> None:
    # Relative storage keys are environment-independent; do not reintroduce
    # deployment-specific absolute paths on downgrade.
    pass


def _normalize_table_paths(conn, table_name: str, marker: str) -> None:
    rows = conn.execute(
        sa.text(f'SELECT id, file_path FROM "{table_name}" WHERE file_path IS NOT NULL')
    ).mappings()
    for row in rows:
        file_path = row["file_path"]
        normalized = _storage_key(file_path, marker)
        if normalized != file_path:
            conn.execute(
                sa.text(f'UPDATE "{table_name}" SET file_path = :file_path WHERE id = :id'),
                {"file_path": normalized, "id": row["id"]},
            )


def _storage_key(path: str, marker: str) -> str:
    normalized = str(path).strip().replace("\\", "/")
    if not normalized:
        return normalized

    parts = [part for part in normalized.split("/") if part and part != "."]
    if marker in parts:
        marker_index = len(parts) - 1 - list(reversed(parts)).index(marker)
        parts = parts[marker_index + 1 :]

    if any(part == ".." for part in parts):
        return normalized
    return "/".join(parts)
