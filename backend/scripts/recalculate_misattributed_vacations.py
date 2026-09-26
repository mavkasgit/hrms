"""Версионированный, идемпотентный скрипт пересчёта трудовых периодов.

Находит сотрудников с рассинхронизацией FIFO и пересчитывает их периоды
существующим механизмом (vacation_period_service.recalculate_periods),
выводя балансы до и после. Два независимых детектора:

1. Мизатрибуция (баг #114) — отпуск имеет автосписания (source_type='vacation'),
   но ни одно не находится в периоде, содержащем дату начала отпуска. Записана
   пре-фиксной версией автосписания, когда частично закрытые периоды пропускались
   и дни уходили в следующий период.

2. Освобождение раннего периода — транзакция по отпуску лежит в периоде P, когда
   есть БОЛЕЕ РАННИЙ период Q с ненулевым остатком. Возникает при удалении
   приказа: дни возвращались в исходный период, но списания соседних отпусков
   оставались в поздних (до фикса ребалансировки).

Ограничение детектора №2: «ранний период с остатком» — недостаточный признак
сами по себе, потому что легитимный FIFO-перелив в следующий период выглядит
так же. Поэтому требуется, чтобы отпуск при этом относился к более раннему
периоду по датам. Ложные срабатывания возможны на данных, где ручное частичное
закрытие намеренно оставило период открытым под будущие списания, — смотрите
dry-run перед --apply.

Скрипт безопасен для повторного запуска: пересчёт детерминирован, поэтому
повторный запуск даёт тот же результат (идемпотентность).

Запуск (из backend/):
  python scripts/recalculate_misattributed_vacations.py            # отчёт (dry-run)
  python scripts/recalculate_misattributed_vacations.py --apply    # пересчитать
  python scripts/recalculate_misattributed_vacations.py --employee-id 55  # только 1 сотрудника
"""
import argparse
import asyncio

from sqlalchemy import case, func, select
from sqlalchemy.orm import aliased

from app.core.database import get_db
from app.models.employee import Employee
from app.models.vacation import Vacation
from app.models.vacation_period import VacationPeriod
from app.models.vacation_period_transaction import VacationPeriodTransaction
from app.services.vacation_period_service import vacation_period_service

SCRIPT_VERSION = "2.0.0"


async def find_misattributed_employee_ids(db, employee_id: int | None = None) -> list[int]:
    """Сотрудники, у которых есть отпуск с мизатрибуцией автосписания.

    Мизатрибуция — отпуск имеет автосписания (source_type='vacation'),
    но ни одно из них не находится в периоде, содержащем дату начала отпуска
    (эффект пре-фиксного бага #114: частично закрытый период пропускался и
    ВСЕ дни уходили в следующий период). Легитимный перелив остатка в соседний
    период при этом не считается мизатрибуцией, т.к. часть дней остаётся
    в корректном периоде.
    """
    tx_alias = aliased(VacationPeriodTransaction)
    vp_alias = aliased(VacationPeriod)
    has_correct_tx = (
        select(tx_alias.id)
        .join(vp_alias, vp_alias.id == tx_alias.period_id)
        .where(
            tx_alias.vacation_id == Vacation.id,
            tx_alias.source_type == "vacation",
            tx_alias.is_reversal.is_(False),
            tx_alias.days_count > 0,
            Vacation.start_date >= vp_alias.period_start,
            Vacation.start_date <= vp_alias.period_end,
        )
        .exists()
    )
    query = (
        select(VacationPeriod.employee_id)
        .join(VacationPeriodTransaction, VacationPeriodTransaction.period_id == VacationPeriod.id)
        .join(Vacation, Vacation.id == VacationPeriodTransaction.vacation_id)
        .where(
            VacationPeriodTransaction.vacation_id.isnot(None),
            VacationPeriodTransaction.source_type == "vacation",
            VacationPeriodTransaction.is_reversal.is_(False),
            VacationPeriodTransaction.days_count > 0,
            ~has_correct_tx,
        )
    )
    if employee_id is not None:
        query = query.where(VacationPeriod.employee_id == employee_id)
    result = await db.execute(query.distinct())
    return sorted(row[0] for row in result.all())


async def find_freed_earlier_period_employee_ids(db, employee_id: int | None = None) -> list[int]:
    """Сотрудники, у которых списание отпуска осталось в позднем периоде
    при свободном более раннем периоде (баг удаления приказа).

    Признак: транзакция по отпуску лежит в периоде P, при этом
      — есть период Q с Q.period_start < P.period_start и ненулевым остатком;
      — дата начала отпуска попадает в Q, а не в P.

    Второе условие отсекает легитимный FIFO-перелив: если отпуск датирован
    внутри P, ушедшие в P дни корректны, даже при свободном Q. Без него
    детектор «лечил» бы данные, где оператор намеренно оставил период
    частично закрытым с открытым остатком.

    Остаток считается как remaining_days (если задан — источник истины),
    иначе total - used_days.
    """
    tx_alias = aliased(VacationPeriodTransaction)
    tx_period = aliased(VacationPeriod)
    early_period = aliased(VacationPeriod)

    def _remaining_expr(alias):
        return func.coalesce(
            case(
                (alias.remaining_days.isnot(None), alias.remaining_days),
                else_=(alias.main_days + alias.additional_days - alias.used_days),
            ),
            0,
        )

    earlier_free_exists = (
        select(early_period.id)
        .where(
            early_period.employee_id == tx_period.employee_id,
            early_period.period_start < tx_period.period_start,
            _remaining_expr(early_period) > 0,
            # Отпуск по датам относится к более раннему периоду
            Vacation.start_date >= early_period.period_start,
            Vacation.start_date <= early_period.period_end,
        )
        .exists()
    )

    query = (
        select(tx_period.employee_id)
        .join(tx_alias, tx_alias.period_id == tx_period.id)
        .join(Vacation, Vacation.id == tx_alias.vacation_id)
        .where(
            tx_alias.source_type == "vacation",
            tx_alias.is_reversal.is_(False),
            tx_alias.days_count > 0,
            # Транзакция лежит не в том периоде, к которому относится отпуск
            ~(
                (Vacation.start_date >= tx_period.period_start)
                & (Vacation.start_date <= tx_period.period_end)
            ),
            earlier_free_exists,
        )
    )
    if employee_id is not None:
        query = query.where(tx_period.employee_id == employee_id)
    result = await db.execute(query.distinct())
    return sorted(row[0] for row in result.all())


def _format_balance(periods) -> list[str]:
    """Форматирует балансы периодов как [год: исп. X / остаток Y]."""
    lines = []
    for p in sorted(periods, key=lambda x: x.period_start):
        total = p.total_days
        used = p.used_days or 0
        remaining = p.remaining_days if p.remaining_days is not None else max(total - used, 0)
        lines.append(
            f"    период {p.year_number} [{p.period_start}..{p.period_end}]: "
            f"исп. {used} / остаток {remaining}"
        )
    return lines


async def run(apply: bool, employee_id: int | None = None) -> None:
    async for db in get_db():
        try:
            print(f"=== recalculate_misattributed_vacations v{SCRIPT_VERSION} ===")
            if apply:
                print("Режим: ПРИМЕНИТЬ (--apply)")
            else:
                print("Режим: отчёт (dry-run). Добавьте --apply для применения.")
            print()

            misattributed = await find_misattributed_employee_ids(db, employee_id)
            freed = await find_freed_earlier_period_employee_ids(db, employee_id)
            ids = sorted(set(misattributed) | set(freed))
            print(f"Сотрудников с мизатрибуцией автосписания: {len(misattributed)}")
            print(f"Сотрудников с откатом списания в свободный ранний период: {len(freed)}")
            print(f"Всего к пересчёту: {len(ids)}")
            print()

            for emp_id in ids:
                employee = await db.get(Employee, emp_id)
                name = employee.name if employee else f"id={emp_id}"
                print(f"Сотрудник {emp_id} ({name})")

                try:
                    before = await vacation_period_service.get_employee_periods(db, emp_id)
                    print("  Балансы ДО пересчёта:")
                    for line in _format_balance(before):
                        print(line)

                    if not apply:
                        continue

                    await vacation_period_service.recalculate_periods(db, emp_id)

                    after = await vacation_period_service.get_employee_periods(db, emp_id)
                    print("  Балансы ПОСЛЕ пересчёта:")
                    for line in _format_balance(after):
                        print(line)
                    print()
                except Exception as e:  # noqa: BLE001 — один сотрудник не должен прерывать весь прогон
                    print(f"  ОШИБКА пересчёта сотрудника: {e}")
                    await db.rollback()

            if not apply:
                print("\nDry-run: изменения не вносились. Запустите с --apply, чтобы пересчитать.")
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
    parser.add_argument("--apply", action="store_true", help="Применить пересчёт (без флага — только отчёт)")
    parser.add_argument("--employee-id", type=int, default=None, help="Обработать только указанного сотрудника")
    args = parser.parse_args()
    asyncio.run(run(args.apply, args.employee_id))
