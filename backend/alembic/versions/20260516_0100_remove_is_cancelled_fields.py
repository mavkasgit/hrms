"""remove is_cancelled fields from orders and vacations

Revision ID: 20260516_0100
Revises: 20260512_0300
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa


revision = '20260516_0100'
down_revision = '20260512_0300'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop index first, then columns from orders
    op.drop_index('ix_orders_is_cancelled', table_name='orders')
    op.drop_column('orders', 'cancelled_by')
    op.drop_column('orders', 'cancelled_at')
    op.drop_column('orders', 'is_cancelled')

    # Drop index first, then columns from vacations
    op.drop_index('ix_vacations_is_cancelled', table_name='vacations')
    op.drop_column('vacations', 'cancelled_by')
    op.drop_column('vacations', 'cancelled_at')
    op.drop_column('vacations', 'is_cancelled')


def downgrade() -> None:
    # Add columns back to vacations
    op.add_column('vacations', sa.Column('is_cancelled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('vacations', sa.Column('cancelled_at', sa.DateTime(timezone=True)))
    op.add_column('vacations', sa.Column('cancelled_by', sa.String(100)))
    op.create_index('ix_vacations_is_cancelled', 'vacations', ['is_cancelled'])

    # Add columns back to orders
    op.add_column('orders', sa.Column('is_cancelled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('orders', sa.Column('cancelled_at', sa.DateTime(timezone=False)))
    op.add_column('orders', sa.Column('cancelled_by', sa.String(100)))
    op.create_index('ix_orders_is_cancelled', 'orders', ['is_cancelled'])
