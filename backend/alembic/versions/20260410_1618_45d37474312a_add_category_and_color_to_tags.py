"""add_category_and_color_to_tags

Revision ID: 45d37474312a
Revises: 001_initial_schema
Create Date: 2026-04-10 16:18:59.587503

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '45d37474312a'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tags', sa.Column('category', sa.String(100), nullable=True))
    op.add_column('tags', sa.Column('color', sa.String(7), nullable=True))
    op.create_index(op.f('ix_tags_category'), 'tags', ['category'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_tags_category'), table_name='tags')
    op.drop_column('tags', 'color')
    op.drop_column('tags', 'category')
