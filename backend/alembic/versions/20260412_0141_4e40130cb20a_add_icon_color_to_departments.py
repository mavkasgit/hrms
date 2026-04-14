"""add_icon_color_to_departments

Revision ID: 4e40130cb20a
Revises: 002_departments_graph
Create Date: 2026-04-12 01:41:56.567072

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4e40130cb20a'
down_revision: Union[str, None] = '002_departments_graph'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('departments', sa.Column('color', sa.String(7), nullable=True))
    op.add_column('departments', sa.Column('icon', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('departments', 'icon')
    op.drop_column('departments', 'color')
