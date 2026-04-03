"""initial_schema

Revision ID: 001_initial
Revises: 
Create Date: 2026-04-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'employees',
        sa.Column('tab_number', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('department', sa.String(length=100), nullable=False),
        sa.Column('position', sa.String(length=100), nullable=False),
        sa.Column('hire_date', sa.Date()),
        sa.Column('birth_date', sa.Date()),
        sa.Column('gender', sa.String(length=1)),
        sa.Column('citizenship', sa.Boolean(), server_default='true'),
        sa.Column('residency', sa.Boolean(), server_default='true'),
        sa.Column('pensioner', sa.Boolean(), server_default='false'),
        sa.Column('payment_form', sa.String(length=50)),
        sa.Column('rate', sa.Float()),
        sa.Column('contract_start', sa.Date()),
        sa.Column('contract_end', sa.Date()),
        sa.Column('personal_number', sa.String(length=50)),
        sa.Column('insurance_number', sa.String(length=50)),
        sa.Column('passport_number', sa.String(length=50)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('tab_number'),
    )
    op.create_index('ix_employees_name', 'employees', ['name'])
    op.create_index('ix_employees_department', 'employees', ['department'])

    op.create_table(
        'order_sequences',
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('last_number', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('year'),
    )

    op.create_table(
        'references',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('value', sa.String(length=255), nullable=False),
        sa.Column('order', sa.Integer(), server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_references_category', 'references', ['category'])

    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False, server_default='hr_specialist'),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username'),
        sa.CheckConstraint("role IN ('admin', 'hr_manager', 'hr_specialist')", name='ck_users_role'),
    )
    op.create_index('ix_users_username', 'users', ['username'])

    op.create_table(
        'orders',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('order_number', sa.String(length=50), nullable=False),
        sa.Column('order_type', sa.String(length=50), nullable=False),
        sa.Column('tab_number', sa.Integer(), nullable=False),
        sa.Column('order_date', sa.Date(), nullable=False),
        sa.Column('created_date', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('file_path', sa.String(length=255)),
        sa.Column('notes', sa.Text()),
        sa.ForeignKeyConstraint(['tab_number'], ['employees.tab_number']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'vacations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('tab_number', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('vacation_type', sa.String(length=50), nullable=False),
        sa.Column('days_count', sa.Integer(), nullable=False),
        sa.Column('vacation_year', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['tab_number'], ['employees.tab_number']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('vacations')
    op.drop_table('orders')
    op.drop_index('ix_users_username', table_name='users')
    op.drop_table('users')
    op.drop_index('ix_references_category', table_name='references')
    op.drop_table('references')
    op.drop_table('order_sequences')
    op.drop_index('ix_employees_department', table_name='employees')
    op.drop_index('ix_employees_name', table_name='employees')
    op.drop_table('employees')
