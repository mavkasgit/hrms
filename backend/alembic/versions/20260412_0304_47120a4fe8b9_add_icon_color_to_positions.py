"""add_icon_color_to_positions

Revision ID: 47120a4fe8b9
Revises: 4e40130cb20a
Create Date: 2026-04-12 03:04:17.506489

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '47120a4fe8b9'
down_revision: Union[str, None] = '4e40130cb20a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('positions', sa.Column('color', sa.String(7), nullable=True))
    op.add_column('positions', sa.Column('icon', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('positions', 'icon')
    op.drop_column('positions', 'color')
