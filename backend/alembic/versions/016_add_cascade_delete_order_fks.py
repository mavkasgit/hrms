"""add cascade delete on vacation and transaction FKs to orders

Revision ID: 016
Revises: 015
Create Date: 2026-05-07

Добавляем ON DELETE CASCADE для FK на orders:
- vacations.order_id (приказ отпуска)
- vacations.recall_order_id (приказ отзыва)
- vacations.postpone_order_id (приказ переноса)
- vacations.extension_order_id (приказ продления)
- vacation_period_transactions (ссылки на приказы в транзакциях)
- vacation_adjustments (ссылки на приказы в корректировках)
"""
from alembic import op


revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # vacations.order_id -> orders.id CASCADE
    op.execute("""
        ALTER TABLE vacations
        DROP CONSTRAINT IF EXISTS vacations_order_id_fkey,
        ADD CONSTRAINT vacations_order_id_fkey
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    """)

    # vacations.recall_order_id -> orders.id CASCADE
    op.execute("""
        ALTER TABLE vacations
        DROP CONSTRAINT IF EXISTS fk_vacations_recall_order,
        ADD CONSTRAINT fk_vacations_recall_order
            FOREIGN KEY (recall_order_id) REFERENCES orders(id) ON DELETE CASCADE
    """)

    # vacations.postpone_order_id -> orders.id CASCADE
    op.execute("""
        ALTER TABLE vacations
        DROP CONSTRAINT IF EXISTS fk_vacations_postpone_order,
        ADD CONSTRAINT fk_vacations_postpone_order
            FOREIGN KEY (postpone_order_id) REFERENCES orders(id) ON DELETE CASCADE
    """)

    # vacations.extension_order_id -> orders.id CASCADE
    op.execute("""
        ALTER TABLE vacations
        DROP CONSTRAINT IF EXISTS fk_vacations_extension_order,
        ADD CONSTRAINT fk_vacations_extension_order
            FOREIGN KEY (extension_order_id) REFERENCES orders(id) ON DELETE CASCADE
    """)

    # vacation_period_transactions.original_order_id -> orders.id CASCADE
    op.execute("""
        ALTER TABLE vacation_period_transactions
        DROP CONSTRAINT IF EXISTS fk_vpt_original_order,
        ADD CONSTRAINT fk_vpt_original_order
            FOREIGN KEY (original_order_id) REFERENCES orders(id) ON DELETE CASCADE
    """)

    # vacation_period_transactions.adjustment_order_id -> orders.id CASCADE
    op.execute("""
        ALTER TABLE vacation_period_transactions
        DROP CONSTRAINT IF EXISTS fk_vpt_adjustment_order,
        ADD CONSTRAINT fk_vpt_adjustment_order
            FOREIGN KEY (adjustment_order_id) REFERENCES orders(id) ON DELETE CASCADE
    """)

    # vacation_adjustments.original_order_id -> orders.id CASCADE
    op.execute("""
        ALTER TABLE vacation_adjustments
        DROP CONSTRAINT IF EXISTS vacation_adjustments_original_order_id_fkey,
        ADD CONSTRAINT vacation_adjustments_original_order_id_fkey
            FOREIGN KEY (original_order_id) REFERENCES orders(id) ON DELETE CASCADE
    """)

    # vacation_adjustments.adjustment_order_id -> orders.id CASCADE
    op.execute("""
        ALTER TABLE vacation_adjustments
        DROP CONSTRAINT IF EXISTS vacation_adjustments_adjustment_order_id_fkey,
        ADD CONSTRAINT vacation_adjustments_adjustment_order_id_fkey
            FOREIGN KEY (adjustment_order_id) REFERENCES orders(id) ON DELETE CASCADE
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE vacations
        DROP CONSTRAINT IF EXISTS vacations_order_id_fkey,
        ADD CONSTRAINT vacations_order_id_fkey
            FOREIGN KEY (order_id) REFERENCES orders(id)
    """)
    op.execute("""
        ALTER TABLE vacations
        DROP CONSTRAINT IF EXISTS fk_vacations_recall_order,
        ADD CONSTRAINT fk_vacations_recall_order
            FOREIGN KEY (recall_order_id) REFERENCES orders(id)
    """)
    op.execute("""
        ALTER TABLE vacations
        DROP CONSTRAINT IF EXISTS fk_vacations_postpone_order,
        ADD CONSTRAINT fk_vacations_postpone_order
            FOREIGN KEY (postpone_order_id) REFERENCES orders(id)
    """)
    op.execute("""
        ALTER TABLE vacations
        DROP CONSTRAINT IF EXISTS fk_vacations_extension_order,
        ADD CONSTRAINT fk_vacations_extension_order
            FOREIGN KEY (extension_order_id) REFERENCES orders(id)
    """)
    op.execute("""
        ALTER TABLE vacation_period_transactions
        DROP CONSTRAINT IF EXISTS fk_vpt_original_order,
        ADD CONSTRAINT fk_vpt_original_order
            FOREIGN KEY (original_order_id) REFERENCES orders(id)
    """)
    op.execute("""
        ALTER TABLE vacation_period_transactions
        DROP CONSTRAINT IF EXISTS fk_vpt_adjustment_order,
        ADD CONSTRAINT fk_vpt_adjustment_order
            FOREIGN KEY (adjustment_order_id) REFERENCES orders(id)
    """)
    op.execute("""
        ALTER TABLE vacation_adjustments
        DROP CONSTRAINT IF EXISTS vacation_adjustments_original_order_id_fkey,
        ADD CONSTRAINT vacation_adjustments_original_order_id_fkey
            FOREIGN KEY (original_order_id) REFERENCES orders(id)
    """)
    op.execute("""
        ALTER TABLE vacation_adjustments
        DROP CONSTRAINT IF EXISTS vacation_adjustments_adjustment_order_id_fkey,
        ADD CONSTRAINT vacation_adjustments_adjustment_order_id_fkey
            FOREIGN KEY (adjustment_order_id) REFERENCES orders(id)
    """)
