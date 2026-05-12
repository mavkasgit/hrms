"""add employment_type to employees

Revision ID: 20260511_0100
Revises: 20260507_0400
Create Date: 2026-05-11 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260511_0100'
down_revision = '20260507_0400'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('employees', sa.Column('employment_type', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('employees', 'employment_type')
