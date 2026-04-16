"""add_sick_leaves_table

Revision ID: 20260416_125546
Revises: 20260415_1736_36761822fac9
Create Date: 2026-04-16 12:55:46.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260416_125546'
down_revision = '20260415_1736_36761822fac9'
branch_labels = None
depends_on = None


def upgrade():
    # Создание enum типа для статусов больничных
    sick_leave_status = sa.Enum('ACTIVE', 'CANCELLED', 'DELETED', name='sickleavestatus')
    sick_leave_status.create(op.get_bind())

    # Создание таблицы sick_leaves
    op.create_table(
        'sick_leaves',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('sick_leave_type', sa.String(length=50), nullable=False),
        sa.Column('certificate_number', sa.String(length=20), nullable=True),
        sa.Column('issued_by', sa.String(length=200), nullable=True),
        sa.Column('status', sick_leave_status, nullable=False, default='ACTIVE'),
        sa.Column('created_at', sa.Date(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.Date(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.Column('deleted_by', sa.Integer(), nullable=True),
        sa.Column('cancelled_by', sa.Integer(), nullable=True),
        sa.Column('comment', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['deleted_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['cancelled_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Создание индексов
    op.create_index('ix_sick_leaves_id', 'sick_leaves', ['id'])
    op.create_index('ix_sick_leaves_employee_id', 'sick_leaves', ['employee_id'])
    op.create_index('ix_sick_leaves_start_date', 'sick_leaves', ['start_date'])
    op.create_index('ix_sick_leaves_end_date', 'sick_leaves', ['end_date'])
    op.create_index('ix_sick_leaves_status', 'sick_leaves', ['status'])
    op.create_index('ix_sick_leaves_employee_dates', 'sick_leaves', ['employee_id', 'start_date', 'end_date'])
    op.create_index('ix_sick_leaves_status_filter', 'sick_leaves', ['status', 'employee_id'])


def downgrade():
    # Удаление индексов
    op.drop_index('ix_sick_leaves_status_filter', table_name='sick_leaves')
    op.drop_index('ix_sick_leaves_employee_dates', table_name='sick_leaves')
    op.drop_index('ix_sick_leaves_status', table_name='sick_leaves')
    op.drop_index('ix_sick_leaves_end_date', table_name='sick_leaves')
    op.drop_index('ix_sick_leaves_start_date', table_name='sick_leaves')
    op.drop_index('ix_sick_leaves_employee_id', table_name='sick_leaves')
    op.drop_index('ix_sick_leaves_id', table_name='sick_leaves')

    # Удаление таблицы
    op.drop_table('sick_leaves')

    # Удаление enum типа
    sick_leave_status = sa.Enum('ACTIVE', 'CANCELLED', 'DELETED', name='sickleavestatus')
    sick_leave_status.drop(op.get_bind())
