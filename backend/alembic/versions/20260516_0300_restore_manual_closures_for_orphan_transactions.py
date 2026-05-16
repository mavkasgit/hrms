"""restore manual closures for orphan manual transactions

Revision ID: 20260516_0300
Revises: 20260516_0200
Create Date: 2026-05-16 03:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260516_0300"
down_revision = "20260516_0200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1) Создаём отсутствующие closures для orphan manual/partial транзакций.
    # Для идемпотентности вставляем только если closure для work_year ещё нет.
    conn.execute(
        sa.text(
            """
            INSERT INTO vacation_period_manual_closures (
                employee_id,
                work_year_start,
                work_year_end,
                days_count,
                closure_type,
                remaining_days,
                order_id,
                reason,
                created_by,
                created_at,
                updated_at
            )
            SELECT
                p.employee_id,
                p.period_start AS work_year_start,
                p.period_end AS work_year_end,
                t.days_count,
                t.transaction_type AS closure_type,
                COALESCE(
                    p.remaining_days,
                    GREATEST((p.main_days + p.additional_days) - COALESCE(p.used_days, 0), 0)
                ) AS remaining_days,
                t.order_id,
                t.description,
                t.created_by,
                COALESCE(t.created_at, now()) AS created_at,
                COALESCE(t.created_at, now()) AS updated_at
            FROM vacation_period_transactions t
            JOIN vacation_periods p
              ON p.id = t.period_id
            LEFT JOIN vacation_period_manual_closures c
              ON c.employee_id = p.employee_id
             AND c.work_year_start = p.period_start
             AND c.work_year_end = p.period_end
            WHERE t.transaction_type IN ('manual_close', 'partial_close')
              AND t.manual_closure_id IS NULL
              AND c.id IS NULL
            """
        )
    )

    # 2) Проставляем manual_closure_id orphan-транзакциям.
    conn.execute(
        sa.text(
            """
            UPDATE vacation_period_transactions t
            SET manual_closure_id = c.id
            FROM vacation_periods p
            JOIN vacation_period_manual_closures c
              ON c.employee_id = p.employee_id
             AND c.work_year_start = p.period_start
             AND c.work_year_end = p.period_end
            WHERE t.period_id = p.id
              AND t.transaction_type IN ('manual_close', 'partial_close')
              AND t.manual_closure_id IS NULL
            """
        )
    )

    # 2.1) Защита от повторного появления orphan manual транзакций.
    conn.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'ck_vpt_manual_tx_requires_closure'
                ) THEN
                    ALTER TABLE vacation_period_transactions
                    ADD CONSTRAINT ck_vpt_manual_tx_requires_closure
                    CHECK (
                        transaction_type NOT IN ('manual_close', 'partial_close')
                        OR manual_closure_id IS NOT NULL
                    );
                END IF;
            END
            $$;
            """
        )
    )

    # 3) Жёсткая проверка: после миграции orphan manual транзакций быть не должно.
    remaining_orphans = conn.execute(
        sa.text(
            """
            SELECT COUNT(*)
            FROM vacation_period_transactions
            WHERE transaction_type IN ('manual_close', 'partial_close')
              AND manual_closure_id IS NULL
            """
        )
    ).scalar_one()
    if remaining_orphans:
        raise RuntimeError(
            f"restore manual closures migration failed: {remaining_orphans} orphan transactions remain"
        )


def downgrade() -> None:
    # Downgrade intentionally omitted: нельзя безопасно определить, какие closures
    # были созданы именно этой миграцией, если в БД уже были historical closures.
    pass
