"""Add days and comment columns to vacation_plans

Revision ID: 20260415_add_days_comment
Revises: 001_initial_schema
Create Date: 2025-04-15

"""
from alembic import op
import sqlalchemy as sa


revision = '20260415_add_days_comment'
down_revision = '47120a4fe8b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('vacation_plans', sa.Column('days_count', sa.Float(), nullable=False, server_default='0'))
    op.add_column('vacation_plans', sa.Column('comment', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('vacation_plans', 'comment')
    op.drop_column('vacation_plans', 'days_count')