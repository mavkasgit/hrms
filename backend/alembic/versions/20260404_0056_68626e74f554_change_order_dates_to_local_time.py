"""change_order_dates_to_local_time

Revision ID: 68626e74f554
Revises: 001_initial
Create Date: 2026-04-04 00:56:49.665916

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '68626e74f554'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Изменяем тип колонок с TIMESTAMP WITH TIME ZONE на TIMESTAMP WITHOUT TIME ZONE
    op.execute("ALTER TABLE orders ALTER COLUMN created_date TYPE TIMESTAMP WITHOUT TIME ZONE")
    op.execute("ALTER TABLE orders ALTER COLUMN deleted_at TYPE TIMESTAMP WITHOUT TIME ZONE")


def downgrade() -> None:
    # Возвращаем обратно TIMESTAMP WITH TIME ZONE
    op.execute("ALTER TABLE orders ALTER COLUMN created_date TYPE TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE orders ALTER COLUMN deleted_at TYPE TIMESTAMP WITH TIME ZONE")
