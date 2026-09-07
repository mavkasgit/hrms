"""Одноразовый откат бага c16d740 в прод-БД: «Отпуск за свой счет» через прямой
приказ (POST /orders) начал уменьшать баланс трудового из-за того, что
auto_use_days вызывался для vacation_unpaid. Скрипт создаёт компенсирующую
транзакцию vacation_restore для каждой пострадавшей пары (vacation, period)
и пересчитывает used_days/used_days_auto периода.

Использование:
  # Dry-run (default): печатает before/after, ничего не меняет.
  python -m backend.scripts.rollback_unpaid_vacation_prod

  # Применить в проде. Требует обязательный флаг-подтверждение.
  python -m backend.scripts.rollback_unpaid_vacation_prod \\
      --apply --i-understand-this-touches-prod

  # Подключение к БД:
  #   DATABASE_URL=postgresql+asyncpg://... python -m ...
  # или --db-url postgresql+asyncpg://...

Перед --apply ОБЯЗАТЕЛЬНО сделать pg_dump:
  pg_dump -Fc -t vacation_periods -t vacation_period_transactions \\
      -t vacations -t orders -t order_types -t employees \\
      hrms_prod > backup_pre_unpaid_rollback_$(date +%Y%m%d).dump

В проде пострадал ровно один кейс (найден диагностикой 2026-09-07):
  vacation_id=172, period_id=21, bad_transaction_id=1384, days=7
  Сотрудник: Божков Олег Леонидович (id=5)
  Приказ:    №56-к (id=282, vacation_unpaid)
  Период:    2026-03-05 → 2027-03-04, 24 main + 1 additional = 25
  Было:      used_days=used_days_auto=7,  current_remaining=18
  Должно:    used_days=used_days_auto=0,  remaining=25
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from typing import Sequence

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


# Хардкод пострадавших кейсов. Не auto-detect: безопасность > гибкость.
# Если в будущем появятся новые случаи (например, через form-путь, которого
# в проде пока нет) — добавить строкой сюда после диагностики.
ROLLBACK_CASES: list[dict] = [
    {
        "period_id": 21,
        "vacation_id": 172,
        "bad_transaction_id": 1384,
        "days": 7,
        "audit_user": "system_rollback_c16d740",
        "reason": "Божков О.Л., приказ №56-к (vacation_unpaid) 12-18.09.2026, 7 дней",
    },
]


@dataclass
class PeriodSnapshot:
    period_id: int
    used_days: int
    used_days_auto: int
    remaining_days: int | None


async def fetch_period(
    db: AsyncSession, period_id: int
) -> PeriodSnapshot | None:
    result = await db.execute(
        text(
            "SELECT used_days, used_days_auto, remaining_days "
            "FROM vacation_periods WHERE id = :pid"
        ),
        {"pid": period_id},
    )
    row = result.first()
    if row is None:
        return None
    return PeriodSnapshot(
        period_id=period_id,
        used_days=row.used_days or 0,
        used_days_auto=row.used_days_auto or 0,
        remaining_days=row.remaining_days,
    )


async def fetch_total_days(db: AsyncSession, period_id: int) -> int | None:
    result = await db.execute(
        text(
            "SELECT main_days + additional_days AS total "
            "FROM vacation_periods WHERE id = :pid"
        ),
        {"pid": period_id},
    )
    row = result.first()
    return row.total if row else None


async def fetch_bad_tx_exists(
    db: AsyncSession, tx_id: int
) -> bool:
    result = await db.execute(
        text(
            "SELECT 1 FROM vacation_period_transactions "
            "WHERE id = :tid AND is_reversal = false"
        ),
        {"tid": tx_id},
    )
    return result.first() is not None


async def fetch_already_reversed(
    db: AsyncSession, tx_id: int
) -> bool:
    """Защита от двойного отката: если уже есть is_reversal=true строка,
    ссылающаяся на эту транзакцию — откат уже выполнен."""
    result = await db.execute(
        text(
            "SELECT 1 FROM vacation_period_transactions "
            "WHERE reversed_transaction_id = :tid AND is_reversal = true"
        ),
        {"tid": tx_id},
    )
    return result.first() is not None


async def fetch_bad_tx_vacation_type(
    db: AsyncSession, tx_id: int
) -> str | None:
    """Проверка: транзакция действительно относится к «Отпуск за свой счет»."""
    result = await db.execute(
        text(
            "SELECT v.vacation_type FROM vacation_period_transactions t "
            "JOIN vacations v ON v.id = t.vacation_id "
            "WHERE t.id = :tid"
        ),
        {"tid": tx_id},
    )
    row = result.first()
    return row.vacation_type if row else None


async def insert_reversal(
    db: AsyncSession,
    *,
    period_id: int,
    vacation_id: int,
    bad_tx_id: int,
    days: int,
    audit_user: str,
    reason: str,
) -> int:
    """Создаёт сторнирующую транзакцию. Возвращает новый id."""
    result = await db.execute(
        text(
            """
            INSERT INTO vacation_period_transactions (
                period_id, vacation_id, order_id, order_number, days_count,
                transaction_type, description, source_type,
                is_reversal, reversed_transaction_id, created_by
            ) VALUES (
                :period_id, :vacation_id, NULL, NULL, :neg_days,
                'vacation_restore', :description, 'unpaid_vacation_bugfix',
                true, :bad_tx_id, :audit_user
            )
            RETURNING id
            """
        ),
        {
            "period_id": period_id,
            "vacation_id": vacation_id,
            "neg_days": -days,
            "description": f"Откат {days} дн. (c16d740 regression): {reason}",
            "bad_tx_id": bad_tx_id,
            "audit_user": audit_user,
        },
    )
    new_id = result.scalar_one()
    return new_id


async def recompute_period_totals(
    db: AsyncSession, period_id: int
) -> None:
    """Пересчитывает used_days/used_days_auto/remaining_days периода
    по ВСЕМ транзакциям (включая новую сторно). Эмулирует логику
    VacationPeriodRepository.recompute_period_totals через прямой SQL."""
    await db.execute(
        text(
            """
            UPDATE vacation_periods vp
            SET
                used_days_auto = COALESCE((
                    SELECT SUM(days_count) FROM vacation_period_transactions t
                    WHERE t.period_id = vp.id
                      AND t.transaction_type NOT IN ('manual_close', 'partial_close')
                ), 0),
                used_days_manual = COALESCE((
                    SELECT SUM(days_count) FROM vacation_period_transactions t
                    WHERE t.period_id = vp.id
                      AND t.transaction_type IN ('manual_close', 'partial_close')
                ), 0),
                used_days = COALESCE((
                    SELECT SUM(days_count) FROM vacation_period_transactions t
                    WHERE t.period_id = vp.id
                ), 0)
            WHERE vp.id = :pid
            """
        ),
        {"pid": period_id},
    )
    await db.execute(
        text(
            """
            UPDATE vacation_periods vp
            SET remaining_days = CASE
                WHEN EXISTS(
                    SELECT 1 FROM vacation_period_transactions t
                    WHERE t.period_id = vp.id
                      AND t.transaction_type IN ('manual_close', 'partial_close')
                      AND t.is_reversal = false
                )
                THEN GREATEST((vp.main_days + vp.additional_days) - vp.used_days, 0)
                ELSE NULL
            END
            WHERE vp.id = :pid
            """
        ),
        {"pid": period_id},
    )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Откат бага c16d740: 'Отпуск за свой счет' → списание трудового",
    )
    parser.add_argument(
        "--db-url",
        default=None,
        help="DB URL (default: $DATABASE_URL). Пример: "
        "postgresql+asyncpg://hrms_user:pass@localhost:5432/hrms_prod",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Применить откат. Без этого флага — dry-run (только печать).",
    )
    parser.add_argument(
        "--i-understand-this-touches-prod",
        action="store_true",
        help="Обязательное подтверждение для --apply. Без него exit 2.",
    )
    return parser.parse_args(argv)


async def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)

    if args.apply and not args.i_understand_this_touches_prod:
        print(
            "ERROR: --apply требует --i-understand-this-touches-prod. "
            "Без подтверждения работаем только в dry-run.",
            file=sys.stderr,
        )
        return 2

    db_url = args.db_url
    if not db_url:
        import os
        db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: задай --db-url или DATABASE_URL", file=sys.stderr)
        return 2

    print(f"Режим: {'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"DB: {db_url.split('@')[-1] if '@' in db_url else db_url}")
    print(f"Кейсов к откату: {len(ROLLBACK_CASES)}")
    print()

    engine = create_async_engine(db_url, future=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as db:
        any_failed = False
        for case in ROLLBACK_CASES:
            print("=" * 72)
            print(
                f"Кейс: period_id={case['period_id']}, "
                f"vacation_id={case['vacation_id']}, "
                f"bad_tx={case['bad_transaction_id']}, "
                f"days={case['days']}"
            )
            print(f"  reason: {case['reason']}")

            # Pre-checks
            bad_vac_type = await fetch_bad_tx_vacation_type(
                db, case["bad_transaction_id"]
            )
            if bad_vac_type is None:
                print(
                    f"  SKIP: транзакция {case['bad_transaction_id']} не найдена "
                    f"или не связана с vacation",
                    file=sys.stderr,
                )
                any_failed = True
                continue
            if bad_vac_type != "Отпуск за свой счет":
                print(
                    f"  SKIP: транзакция {case['bad_transaction_id']} "
                    f"относится к vacation_type={bad_vac_type!r}, "
                    f"а не к «Отпуск за свой счет»",
                    file=sys.stderr,
                )
                any_failed = True
                continue

            if await fetch_already_reversed(db, case["bad_transaction_id"]):
                print(
                    f"  SKIP: транзакция {case['bad_transaction_id']} "
                    f"уже имеет is_reversal=true сторно",
                    file=sys.stderr,
                )
                continue

            before = await fetch_period(db, case["period_id"])
            if before is None:
                print(
                    f"  SKIP: период {case['period_id']} не найден",
                    file=sys.stderr,
                )
                any_failed = True
                continue
            total = await fetch_total_days(db, case["period_id"])
            assert total is not None
            expected_used = before.used_days - case["days"]
            expected_remaining_before = (
                (total - before.used_days) if before.remaining_days is not None
                else None
            )
            print(
                f"  BEFORE: used={before.used_days}, "
                f"used_auto={before.used_days_auto}, "
                f"remaining={before.remaining_days} "
                f"(calc: total={total} - used={before.used_days} = "
                f"{expected_remaining_before})"
            )

            if not args.apply:
                print(
                    f"  DRY-RUN: после отката used={expected_used}, "
                    f"remaining={total - expected_used} "
                    f"(изменится: used -{case['days']})"
                )
                continue

            # Apply
            new_tx_id = await insert_reversal(
                db,
                period_id=case["period_id"],
                vacation_id=case["vacation_id"],
                bad_tx_id=case["bad_transaction_id"],
                days=case["days"],
                audit_user=case["audit_user"],
                reason=case["reason"],
            )
            print(f"  INSERT: новая сторно-транзакция id={new_tx_id}")

            await recompute_period_totals(db, case["period_id"])

            after = await fetch_period(db, case["period_id"])
            assert after is not None
            print(
                f"  AFTER:  used={after.used_days}, "
                f"used_auto={after.used_days_auto}, "
                f"remaining={after.remaining_days}"
            )

            if after.used_days < 0:
                print(
                    f"  ERROR: used_days уехал в минус ({after.used_days}). "
                    f"Транзакция зафиксирована, но требует ручного разбора.",
                    file=sys.stderr,
                )
                any_failed = True
            elif after.used_days != expected_used:
                print(
                    f"  WARN: ожидалось used={expected_used}, "
                    f"получилось {after.used_days}",
                    file=sys.stderr,
                )
                any_failed = True

        if args.apply:
            if any_failed:
                print()
                print(
                    "WARN: были проблемы. Делаю COMMIT (транзакции уже применены, "
                    "откатить сложнее, чем зафиксировать).",
                    file=sys.stderr,
                )
            await db.commit()
            print()
            print("COMMIT выполнен.")
        else:
            print()
            print("DRY-RUN: ничего не зафиксировано.")

    await engine.dispose()
    return 1 if any_failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
