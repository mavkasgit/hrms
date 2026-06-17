"""add display_name to orders and order_types

Revision ID: 013
Revises: 012
Create Date: 2026-05-07 01:00:00.000000

"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '013'
down_revision: Union[str, None] = '012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('display_name', sa.String(500), nullable=True))
    op.add_column('order_types', sa.Column('display_name', sa.String(500), nullable=True))

    # Заполнить display_name для существующих order_types
    op.execute("""
        UPDATE order_types
        SET display_name = 'Шаблон - ' || name || '.docx'
        WHERE display_name IS NULL
    """)

    # Заполнить display_name для существующих orders из file_path
    # Для PostgreSQL: используем substring для извлечения имени файла
    op.execute("""
        UPDATE orders
        SET display_name = CASE
            WHEN file_path IS NOT NULL AND file_path != ''
            THEN substring(file_path from '/?([^/]+)$')
            ELSE NULL
        END
        WHERE display_name IS NULL
    """)


def downgrade() -> None:
    op.drop_column('order_types', 'display_name')
    op.drop_column('orders', 'display_name')
