"""add employment_type to employees

Revision ID: 017
Revises: 016
Create Date: 2026-05-11 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('employees', sa.Column('employment_type', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('employees', 'employment_type')
