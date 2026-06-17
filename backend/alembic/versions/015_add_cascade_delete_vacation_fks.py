"""add cascade delete on vacation foreign keys

Revision ID: 015
Revises: 014
Create Date: 2026-05-07

Добавляем ON DELETE CASCADE для FK vacation_id в:
- vacation_period_transactions
- vacation_adjustments

Это позволяет удалять отпуск вместе со связанными транзакциями и корректировками.
"""
from alembic import op


revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE vacation_period_transactions
        DROP CONSTRAINT IF EXISTS vacation_period_transactions_vacation_id_fkey,
        ADD CONSTRAINT vacation_period_transactions_vacation_id_fkey
            FOREIGN KEY (vacation_id) REFERENCES vacations(id) ON DELETE CASCADE
    """)

    op.execute("""
        ALTER TABLE vacation_adjustments
        DROP CONSTRAINT IF EXISTS vacation_adjustments_vacation_id_fkey,
        ADD CONSTRAINT vacation_adjustments_vacation_id_fkey
            FOREIGN KEY (vacation_id) REFERENCES vacations(id) ON DELETE CASCADE
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE vacation_period_transactions
        DROP CONSTRAINT IF EXISTS vacation_period_transactions_vacation_id_fkey,
        ADD CONSTRAINT vacation_period_transactions_vacation_id_fkey
            FOREIGN KEY (vacation_id) REFERENCES vacations(id)
    """)

    op.execute("""
        ALTER TABLE vacation_adjustments
        DROP CONSTRAINT IF EXISTS vacation_adjustments_vacation_id_fkey,
        ADD CONSTRAINT vacation_adjustments_vacation_id_fkey
            FOREIGN KEY (vacation_id) REFERENCES vacations(id)
    """)
