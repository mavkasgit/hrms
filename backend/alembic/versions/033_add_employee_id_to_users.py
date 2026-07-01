"""add employee_id to users and align FK cascades

Восстанавливает ondelete='CASCADE' на FK vacations / vacation_period_transactions /
vacation_adjustments (был утерян при предыдущем автогенераторе) и приводит имена
ограничений к явному виду, чтобы downgrade был обратим.

Использует DROP CONSTRAINT IF EXISTS — имена FK в БД могут различаться
(стандартные `<table>_<col>_fkey` или явные `fk_<table>_<col>` после ручных
правок в 010/015/016), и миграция должна быть идемпотентна по отношению к ним.

Revision ID: 033
Revises: 032
Create Date: 2026-06-16 22:54:10.845742

"""
from alembic import op
import sqlalchemy as sa


revision = '033'
down_revision = '032'
branch_labels = None
depends_on = None


# Колонка → каноничное имя FK (используется при пересоздании)
VACATIONS_FK = {
    "order_id": "fk_vacations_order",
    "extension_order_id": "fk_vacations_extension_order",
    "recall_order_id": "fk_vacations_recall_order",
    "postpone_order_id": "fk_vacations_postpone_order",
}

VPT_FK_TO_ORDERS = {
    "original_order_id": "fk_vpt_original_order",
    "adjustment_order_id": "fk_vpt_adjustment_order",
}

VA_FK_TO_ORDERS = {
    "original_order_id": "fk_vacation_adjustments_original_order",
    "adjustment_order_id": "fk_vacation_adjustments_adjustment_order",
}


def _drop_fk_if_exists(table: str, constraint: str) -> None:
    op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")


def _drop_any_fk(table: str, column: str, *names: str) -> None:
    """Дропает FK по любому из возможных имён (стандартное + явные)."""
    _drop_fk_if_exists(table, f"{table}_{column}_fkey")
    for name in names:
        _drop_fk_if_exists(table, name)


def upgrade() -> None:
    # documents: разделяем составной индекс на два одиночных
    op.drop_index(op.f('ix_documents_doc_code_is_current'), table_name='documents')
    op.drop_index(op.f('ix_staffing_documents_is_current'), table_name='documents')
    op.create_index(op.f('ix_documents_doc_code'), 'documents', ['doc_code'], unique=False)
    op.create_index(op.f('ix_documents_is_current'), 'documents', ['is_current'], unique=False)

    # reference-таблицы: заменяем обычный индекс на уникальный constraint
    op.drop_index(op.f('ix_notification_types_name'), table_name='notification_types')
    op.create_unique_constraint('uq_notification_types_name', 'notification_types', ['name'])
    op.drop_index(op.f('ix_statement_types_name'), table_name='statement_types')
    op.create_unique_constraint('uq_statement_types_name', 'statement_types', ['name'])

    # order_employees: снимаем unique, дубликаты допустимы в новой модели
    op.drop_constraint(op.f('uq_order_employees_order_employee'), 'order_employees', type_='unique')

    # orders: индекс по employee_id
    op.create_index(op.f('ix_orders_employee_id'), 'orders', ['employee_id'], unique=False)

    # users.employee_id
    op.add_column('users', sa.Column('employee_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_users_employee_id', 'users', 'employees', ['employee_id'], ['id'])

    # vacations FKs → orders с CASCADE
    for col, fk_name in VACATIONS_FK.items():
        _drop_any_fk('vacations', col, fk_name)
        op.create_foreign_key(
            fk_name, 'vacations', 'orders', [col], ['id'], ondelete='CASCADE'
        )

    # vacation_period_transactions FKs → orders с CASCADE
    for col, fk_name in VPT_FK_TO_ORDERS.items():
        _drop_any_fk('vacation_period_transactions', col, fk_name)
        op.create_foreign_key(
            fk_name, 'vacation_period_transactions', 'orders', [col], ['id'], ondelete='CASCADE'
        )

    # vacation_period_transactions.vacation_id → vacations.id CASCADE
    _drop_any_fk('vacation_period_transactions', 'vacation_id', 'fk_vpt_vacation')
    op.create_foreign_key(
        'fk_vpt_vacation', 'vacation_period_transactions', 'vacations',
        ['vacation_id'], ['id'], ondelete='CASCADE'
    )

    # vacation_adjustments FKs → orders с CASCADE
    for col, fk_name in VA_FK_TO_ORDERS.items():
        _drop_any_fk('vacation_adjustments', col, fk_name)
        op.create_foreign_key(
            fk_name, 'vacation_adjustments', 'orders', [col], ['id'], ondelete='CASCADE'
        )

    # vacation_adjustments.vacation_id → vacations.id CASCADE
    _drop_any_fk('vacation_adjustments', 'vacation_id', 'fk_vacation_adjustments_vacation')
    op.create_foreign_key(
        'fk_vacation_adjustments_vacation', 'vacation_adjustments', 'vacations',
        ['vacation_id'], ['id'], ondelete='CASCADE'
    )

    # rename индексов на новый формат имён
    for old, new in [
        ('ix_vpt_adjustment_id', 'ix_vacation_period_transactions_adjustment_id'),
        ('ix_vpt_adjustment_order_id', 'ix_vacation_period_transactions_adjustment_order_id'),
        ('ix_vpt_manual_closure_id', 'ix_vacation_period_transactions_manual_closure_id'),
        ('ix_vpt_original_order_id', 'ix_vacation_period_transactions_original_order_id'),
    ]:
        op.drop_index(op.f(old), table_name='vacation_period_transactions')
    op.create_index(
        'ix_vacation_period_transactions_adjustment_id',
        'vacation_period_transactions', ['adjustment_id'], unique=False
    )
    op.create_index(
        'ix_vacation_period_transactions_adjustment_order_id',
        'vacation_period_transactions', ['adjustment_order_id'], unique=False
    )
    op.create_index(
        'ix_vacation_period_transactions_manual_closure_id',
        'vacation_period_transactions', ['manual_closure_id'], unique=False
    )
    op.create_index(
        'ix_vacation_period_transactions_original_order_id',
        'vacation_period_transactions', ['original_order_id'], unique=False
    )


def downgrade() -> None:
    # vacation_adjustments
    _drop_any_fk('vacation_adjustments', 'vacation_id', 'fk_vacation_adjustments_vacation')
    _drop_any_fk('vacation_adjustments', 'original_order_id', 'fk_vacation_adjustments_original_order')
    _drop_any_fk('vacation_adjustments', 'adjustment_order_id', 'fk_vacation_adjustments_adjustment_order')
    op.create_foreign_key(
        'fk_vacation_adjustments_adjustment_order', 'vacation_adjustments',
        'orders', ['adjustment_order_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_vacation_adjustments_original_order', 'vacation_adjustments',
        'orders', ['original_order_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_vacation_adjustments_vacation', 'vacation_adjustments',
        'vacations', ['vacation_id'], ['id'], ondelete='CASCADE'
    )

    # vacation_period_transactions
    _drop_any_fk('vacation_period_transactions', 'vacation_id', 'fk_vpt_vacation')
    _drop_any_fk('vacation_period_transactions', 'original_order_id', 'fk_vpt_original_order')
    _drop_any_fk('vacation_period_transactions', 'adjustment_order_id', 'fk_vpt_adjustment_order')
    op.create_foreign_key(
        'fk_vpt_adjustment_order', 'vacation_period_transactions',
        'orders', ['adjustment_order_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_vpt_original_order', 'vacation_period_transactions',
        'orders', ['original_order_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_vpt_vacation', 'vacation_period_transactions',
        'vacations', ['vacation_id'], ['id'], ondelete='CASCADE'
    )

    # индексы обратно к старым именам
    op.drop_index('ix_vacation_period_transactions_original_order_id', table_name='vacation_period_transactions')
    op.drop_index('ix_vacation_period_transactions_manual_closure_id', table_name='vacation_period_transactions')
    op.drop_index('ix_vacation_period_transactions_adjustment_order_id', table_name='vacation_period_transactions')
    op.drop_index('ix_vacation_period_transactions_adjustment_id', table_name='vacation_period_transactions')
    op.create_index('ix_vpt_original_order_id', 'vacation_period_transactions', ['original_order_id'], unique=False)
    op.create_index('ix_vpt_manual_closure_id', 'vacation_period_transactions', ['manual_closure_id'], unique=False)
    op.create_index('ix_vpt_adjustment_order_id', 'vacation_period_transactions', ['adjustment_order_id'], unique=False)
    op.create_index('ix_vpt_adjustment_id', 'vacation_period_transactions', ['adjustment_id'], unique=False)

    # vacations
    for col, fk_name in VACATIONS_FK.items():
        _drop_any_fk('vacations', col, fk_name)
    for col, fk_name in [
        ('postpone_order_id', 'fk_vacations_postpone_order'),
        ('recall_order_id', 'fk_vacations_recall_order'),
        ('order_id', 'fk_vacations_order'),
        ('extension_order_id', 'fk_vacations_extension_order'),
    ]:
        op.create_foreign_key(
            fk_name, 'vacations', 'orders', [col], ['id'], ondelete='CASCADE'
        )

    # users.employee_id
    op.drop_constraint('fk_users_employee_id', 'users', type_='foreignkey')
    op.drop_column('users', 'employee_id')

    # orders
    op.drop_index(op.f('ix_orders_employee_id'), table_name='orders')

    # order_employees unique
    op.create_unique_constraint(
        op.f('uq_order_employees_order_employee'),
        'order_employees', ['order_id', 'employee_id'], postgresql_nulls_not_distinct=False
    )

    # reference-таблицы
    op.drop_constraint('uq_notification_types_name', 'notification_types', type_='unique')
    op.create_index(op.f('ix_notification_types_name'), 'notification_types', ['name'], unique=True)
    op.drop_constraint('uq_statement_types_name', 'statement_types', type_='unique')
    op.create_index(op.f('ix_statement_types_name'), 'statement_types', ['name'], unique=True)

    # documents
    op.drop_index(op.f('ix_documents_is_current'), table_name='documents')
    op.drop_index(op.f('ix_documents_doc_code'), table_name='documents')
    op.create_index(op.f('ix_staffing_documents_is_current'), 'documents', ['is_current'], unique=False)
    op.create_index(op.f('ix_documents_doc_code_is_current'), 'documents', ['doc_code', 'is_current'], unique=False)
