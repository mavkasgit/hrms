"""ВРЕМЕННЫЙ СКРИПТ (первый на очереди к удалению).

Починка данных: сброс испорченного remaining_days у открытых периодов.

Баг: recompute_period_totals проставлял remaining_days открытым периодам
(маркер «закрытого» периода), из-за чего auto_use_days считал их закрытыми
и списывал дни следующего отпуска не туда (в будущий период).

Само поле remaining_days — денаормализованный маркер: NULL = открыт, число =
закрыт/частично закрыт. У открытого периода оно должно быть NULL, а остаток
считается на лету как total_days - used_days. Сами транзакции (used_days,
история ручных закрытий) при этом баге НЕ страдают.

Поэтому починка — единственный UPDATE, сбрасывающий remaining_days в NULL у
периодов, у которых нет manual/partial_close транзакции. Историю не трогаем:
даты и описания ручных закрытий остаются как были.

Запуск (из backend/):
  python scripts/repair_vacation_periods.py            # отчёт (dry-run)
  python scripts/repair_vacation_periods.py --apply    # применить
"""
import argparse
import asyncio

from sqlalchemy import select, update

from app.core.database import get_db
from app.models.employee import Employee
from app.models.vacation_period import VacationPeriod
from app.models.vacation_period_transaction import VacationPeriodTransaction


async def _corrupted_periods(db):
    """Периоды с остатком, но без ручного закрытия (т.е. открытые и испорченные)."""
    manual_tx_periods = (
        select(VacationPeriodTransaction.period_id)
        .where(
            VacationPeriodTransaction.transaction_type.in_(("manual_close", "partial_close"))
        )
        .subquery()
    )
    result = await db.execute(
        select(VacationPeriod, Employee.name)
        .join(Employee, Employee.id == VacationPeriod.employee_id)
        .where(
            VacationPeriod.remaining_days.isnot(None),
            ~VacationPeriod.id.in_(select(manual_tx_periods.c.period_id)),
        )
        .order_by(VacationPeriod.employee_id, VacationPeriod.year_number)
    )
    return list(result.all())


async def repair(apply: bool) -> None:
    async for db in get_db():
        try:
            rows = await _corrupted_periods(db)
            print(f"Испорченных открытых периодов: {len(rows)}")

            if not apply:
                for period, name in rows:
                    print(
                        f"  id={period.id} emp={period.employee_id} ({name}) "
                        f"год {period.year_number} [{period.period_start}]: "
                        f"remaining_days={period.remaining_days} -> NULL, "
                        f"used_days={period.used_days} (не меняется)"
                    )
                print("\nЗапустите с --apply, чтобы сбросить remaining_days в NULL.")
                return

            ids = [period.id for period, _ in rows]
            if ids:
                await db.execute(
                    update(VacationPeriod)
                    .where(VacationPeriod.id.in_(ids))
                    .values(remaining_days=None)
                )
                await db.commit()
            print(f"Сброшено remaining_days у {len(ids)} периодов. Транзакции не тронуты.")
        except Exception as e:  # noqa: BLE001 — отчёт об ошибке на stdout
            import traceback

            print(f"\nОшибка: {e}")
            traceback.print_exc()
            await db.rollback()
        finally:
            await db.close()
            break


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Применить починку (без флага — только отчёт)")
    args = parser.parse_args()
    asyncio.run(repair(args.apply))
