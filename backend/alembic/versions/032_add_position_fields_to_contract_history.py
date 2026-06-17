"""add position fields to contract_history

Revision ID: 032
Revises: 031
Create Date: 2026-06-02 07:19:33.243927

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '032'
down_revision: Union[str, None] = '031'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('contract_history', sa.Column('old_position', sa.String(200), nullable=True))
    op.add_column('contract_history', sa.Column('new_position', sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column('contract_history', 'new_position')
    op.drop_column('contract_history', 'old_position')
