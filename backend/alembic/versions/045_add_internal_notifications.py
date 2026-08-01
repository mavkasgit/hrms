"""add internal_notifications table (UI notifications with DB state, #18)

Revision ID: 045
Revises: 044
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa


revision = '045'
down_revision = '044'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'internal_notifications',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('notification_type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('entity_type', sa.String(length=50), nullable=True),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_internal_notifications_user_id', 'internal_notifications', ['user_id'])
    op.create_index(
        'ix_internal_notifications_user_unclosed', 'internal_notifications', ['user_id', 'closed_at']
    )
    op.create_index(
        'ix_internal_notifications_dedup',
        'internal_notifications',
        ['notification_type', 'entity_type', 'entity_id', 'user_id'],
    )
    op.create_index(
        'ix_internal_notifications_notification_type',
        'internal_notifications',
        ['notification_type'],
    )
    op.create_index(
        'ix_internal_notifications_entity_type', 'internal_notifications', ['entity_type']
    )


def downgrade() -> None:
    op.drop_index('ix_internal_notifications_entity_type', table_name='internal_notifications')
    op.drop_index(
        'ix_internal_notifications_notification_type', table_name='internal_notifications'
    )
    op.drop_index('ix_internal_notifications_dedup', table_name='internal_notifications')
    op.drop_index('ix_internal_notifications_user_unclosed', table_name='internal_notifications')
    op.drop_index('ix_internal_notifications_user_id', table_name='internal_notifications')
    op.drop_table('internal_notifications')
