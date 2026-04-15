"""Rename days_count to plan_count and change type to String

Revision ID: 20260415_rename_days_count
Revises: 20260415_add_days_comment
Create Date: 2025-04-15

"""
from alembic import op
import sqlalchemy as sa


revision = '20260415_rename_days_count'
down_revision = '20260415_add_days_comment'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем новую колонку plan_count как String
    op.add_column('vacation_plans', sa.Column('plan_count', sa.String(length=50), nullable=True))
    
    # Копируем данные из days_count в plan_count (конвертируем float в string)
    op.execute('UPDATE vacation_plans SET plan_count = CAST(days_count AS VARCHAR(50))')
    
    # Делаем plan_count NOT NULL
    op.alter_column('vacation_plans', 'plan_count', nullable=False)
    
    # Удаляем старую колонку
    op.drop_column('vacation_plans', 'days_count')


def downgrade() -> None:
    # Добавляем обратно days_count как Float
    op.add_column('vacation_plans', sa.Column('days_count', sa.Float(), nullable=True))
    
    # Копируем данные из plan_count в days_count (конвертируем string в float)
    op.execute('UPDATE vacation_plans SET days_count = CAST(plan_count AS FLOAT)')
    
    # Делаем days_count NOT NULL
    op.alter_column('vacation_plans', 'days_count', nullable=False)
    
    # Удаляем plan_count
    op.drop_column('vacation_plans', 'plan_count')
