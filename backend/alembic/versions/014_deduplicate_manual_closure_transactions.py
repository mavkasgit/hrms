"""deduplicate vacation period manual closure transactions

Revision ID: 014
Revises: 013
Create Date: 2026-05-07

Для каждого (period_id, manual_closure_id, transaction_type) оставляем только
последнюю транзакцию (по id), остальные удаляем. После этого пересчитываем
used_days, used_days_manual, used_days_auto для затронутых периодов.
"""
from alembic import op
import sqlalchemy as sa


revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Находим дубли: для каждого (period_id, transaction_type) оставляем
    # последнюю транзакцию (по max id), остальные удаляем.
    # Группируем по transaction_type т.к. manual_closure_id может быть NULL
    # для старых данных.
    conn.execute(sa.text("""
        DELETE FROM vacation_period_transactions
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY period_id, transaction_type
                           ORDER BY id DESC
                       ) as rn
                FROM vacation_period_transactions
                WHERE transaction_type IN ('manual_close', 'partial_close')
            ) sub
            WHERE rn > 1
        )
    """))

    # Пересчитываем итоги для всех периодов, у которых были транзакции
    # used_days_manual = ДНЕЙ из ПОСЛЕДНЕЙ manual/partial_close транзакции (не сумма!)
    # used_days_auto = СУММА всех auto транзакций
    conn.execute(sa.text("""
        UPDATE vacation_periods
        SET
            used_days_manual = COALESCE(
                (SELECT days_count FROM vacation_period_transactions
                 WHERE period_id = vacation_periods.id
                   AND transaction_type IN ('manual_close', 'partial_close')
                 ORDER BY id DESC
                 LIMIT 1), 0),
            used_days_auto = COALESCE(
                (SELECT SUM(days_count) FROM vacation_period_transactions
                 WHERE period_id = vacation_periods.id
                   AND transaction_type NOT IN ('manual_close', 'partial_close')), 0)
        WHERE id IN (
            SELECT DISTINCT period_id FROM vacation_period_transactions
        )
    """))

    # used_days = used_days_auto + used_days_manual
    conn.execute(sa.text("""
        UPDATE vacation_periods
        SET used_days = COALESCE(used_days_auto, 0) + COALESCE(used_days_manual, 0)
        WHERE id IN (
            SELECT DISTINCT period_id FROM vacation_period_transactions
        )
    """))

    # Пересчитываем remaining_days для периодов с явно установленным остатком
    conn.execute(sa.text("""
        UPDATE vacation_periods
        SET remaining_days = GREATEST(
            (main_days + additional_days) - used_days, 0
        )
        WHERE remaining_days IS NOT NULL
    """))


def downgrade() -> None:
    # Нельзя восстановить удалённые дубли
    pass
