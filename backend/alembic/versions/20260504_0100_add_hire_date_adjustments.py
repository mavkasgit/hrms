"""add hire_date_adjustments table

Revision ID: 20260504_0100
Revises: 20260430_1530_7a1f2d9c6b4e
Create Date: 2026-05-04 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '7a1f2d9c6b4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Проверяем существует ли таблица
    conn = op.get_bind()
    has_table = conn.execute(
        sa.text("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'hire_date_adjustments')")
    ).scalar()

    if not has_table:
        op.create_table(
            'hire_date_adjustments',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False),
            sa.Column('adjustment_date', sa.Date(), nullable=False),
            sa.Column('reason', sa.String(500), nullable=False),
            sa.Column('created_by', sa.String(100), nullable=False, server_default='admin'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index('ix_hire_date_adjustments_employee_id', 'hire_date_adjustments', ['employee_id'])
    else:
        # Таблица уже есть — добавляем недостающие колонки если нужно
        columns = [row[0] for row in conn.execute(
            sa.text("SELECT column_name FROM information_schema.columns WHERE table_name = 'hire_date_adjustments'")
        )]
        if 'created_by' not in columns:
            op.add_column('hire_date_adjustments', sa.Column('created_by', sa.String(100), nullable=False, server_default='admin'))
        if 'created_at' not in columns:
            op.add_column('hire_date_adjustments', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()))

        # Проверяем индекс
        has_index = conn.execute(
            sa.text("SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'ix_hire_date_adjustments_employee_id')")
        ).scalar()
        if not has_index:
            op.create_index('ix_hire_date_adjustments_employee_id', 'hire_date_adjustments', ['employee_id'])


def downgrade() -> None:
    conn = op.get_bind()
    has_table = conn.execute(
        sa.text("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'hire_date_adjustments')")
    ).scalar()
    if has_table:
        op.drop_table('hire_date_adjustments')
