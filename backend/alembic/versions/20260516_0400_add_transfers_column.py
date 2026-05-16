"""add transfers JSON column to employees

Revision ID: 20260516_0400
Revises: 20260516_0300
Create Date: 2026-05-16 04:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260516_0400'
down_revision: Union[str, None] = '20260516_0300'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('employees', sa.Column('transfers', sa.JSON, nullable=True, server_default='[]'))


def downgrade() -> None:
    op.drop_column('employees', 'transfers')
