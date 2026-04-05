"""initial schema: users, employees, orders, vacations, audit logs

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-04-03
"""
from alembic import op
import sqlalchemy as sa

revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(100), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), server_default='hr_specialist', nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True)),
        sa.Column('deleted_by', sa.String(100)),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username'),
        sa.CheckConstraint("role IN ('admin', 'hr_manager', 'hr_specialist')", name='ck_users_role'),
    )

    op.create_table(
        'employees',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tab_number', sa.Integer()),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('department', sa.String(100), nullable=False),
        sa.Column('position', sa.String(100), nullable=False),
        sa.Column('hire_date', sa.Date()),
        sa.Column('birth_date', sa.Date()),
        sa.Column('gender', sa.String(1)),
        sa.Column('citizenship', sa.Boolean(), server_default='true'),
        sa.Column('residency', sa.Boolean(), server_default='true'),
        sa.Column('pensioner', sa.Boolean(), server_default='false'),
        sa.Column('payment_form', sa.String(50)),
        sa.Column('rate', sa.Float()),
        sa.Column('contract_start', sa.Date()),
        sa.Column('contract_end', sa.Date()),
        sa.Column('personal_number', sa.String(50)),
        sa.Column('insurance_number', sa.String(50)),
        sa.Column('passport_number', sa.String(50)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('is_archived', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('terminated_date', sa.Date()),
        sa.Column('termination_reason', sa.String(255)),
        sa.Column('archived_by', sa.String(100)),
        sa.Column('archived_at', sa.DateTime(timezone=True)),
        sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True)),
        sa.Column('deleted_by', sa.String(100)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_employees_department', 'employees', ['department'])
    op.create_index('ix_employees_is_archived', 'employees', ['is_archived'])
    op.create_index('ix_employees_is_deleted', 'employees', ['is_deleted'])
    op.create_index('ix_employees_name', 'employees', ['name'])
    op.create_index('ix_employees_tab_number', 'employees', ['tab_number'], unique=True)

    op.create_table(
        'vacations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('vacation_type', sa.String(50), nullable=False),
        sa.Column('days_count', sa.Integer(), nullable=False),
        sa.Column('vacation_year', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True)),
        sa.Column('deleted_by', sa.String(100)),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_vacations_is_deleted', 'vacations', ['is_deleted'])

    op.create_table(
        'orders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('order_number', sa.String(50), nullable=False),
        sa.Column('order_type', sa.String(50), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('order_date', sa.Date(), nullable=False),
        sa.Column('created_date', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('file_path', sa.String(255)),
        sa.Column('notes', sa.Text()),
        sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('deleted_at', sa.DateTime()),
        sa.Column('deleted_by', sa.String(100)),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_orders_is_deleted', 'orders', ['is_deleted'])

    op.create_table(
        'employee_audit_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('changed_fields', sa.JSON()),
        sa.Column('performed_by', sa.String(100)),
        sa.Column('performed_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('reason', sa.String(255)),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_employee_audit_log_employee_id', 'employee_audit_log', ['employee_id'])

    op.create_table(
        'order_sequences',
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('last_number', sa.Integer(), server_default='0', nullable=False),
        sa.PrimaryKeyConstraint('year'),
    )

    op.create_table(
        'templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('order_type', sa.String(100), nullable=False),
        sa.Column('file_name', sa.String(255), nullable=False),
        sa.Column('file_content', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_by', sa.String(100)),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('templates')
    op.drop_table('order_sequences')
    op.drop_index('ix_employee_audit_log_employee_id', table_name='employee_audit_log')
    op.drop_table('employee_audit_log')
    op.drop_index('ix_orders_is_deleted', table_name='orders')
    op.drop_table('orders')
    op.drop_index('ix_vacations_is_deleted', table_name='vacations')
    op.drop_table('vacations')
    op.drop_index('ix_employees_tab_number', table_name='employees')
    op.drop_index('ix_employees_name', table_name='employees')
    op.drop_index('ix_employees_is_deleted', table_name='employees')
    op.drop_index('ix_employees_is_archived', table_name='employees')
    op.drop_index('ix_employees_department', table_name='employees')
    op.drop_table('employees')
    op.drop_table('users')
