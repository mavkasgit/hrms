"""add updated_at to work_schedule_entries and fix sick_leaves updated_at type

Revision ID: 044
Revises: 043
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa


revision = '044'
down_revision = '043'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем updated_at в work_schedule_entries для отслеживания «приказ изменился»
    op.add_column(
        'work_schedule_entries',
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Меняем тип updated_at в sick_leaves с DATE на TIMESTAMP WITH TIME ZONE
    op.execute(
        "ALTER TABLE sick_leaves "
        "ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE "
        "USING updated_at::timestamp with time zone"
    )


def downgrade() -> None:
    # Возвращаем тип updated_at в sick_leaves обратно на DATE
    op.execute(
        "ALTER TABLE sick_leaves "
        "ALTER COLUMN updated_at TYPE DATE "
        "USING updated_at::date"
    )

    # Удаляем колонку updated_at из work_schedule_entries
    op.drop_column('work_schedule_entries', 'updated_at')
