"""Версионированный, идемпотентный скрипт пересчёта трудовых периодов.

Находит сотрудников, у которых фактические автосписания отпусков расходятся
с эталонным FIFO-распределением, и пересчитывает их существующим механизмом
(vacation_period_service.recalculate_periods), выводя балансы до и после.

Эталон повторяет recalculate_periods:
  — трудовые отпуска с приказом, не удалённые, в порядке даты начала;
  — дни списываются FIFO: сначала самый старый незакрытый период, затем
    следующий и так далее;
  — ручное закрытие (полное/частичное) уменьшает ёмкость периода до
    зафиксированного остатка — как _reapply_manual_closures, включая
    снапшот доп. дней на момент закрытия (#123).

Мизатрибуция — любое расхождение факта с эталоном: дни отпуска лежат не в
тех периодах, которые дал бы FIFO-порядок, либо автосписание отсутствует.
Легитимный перелив «назад» (отпуск стартует в новом периоде, а дни уходят в
более старые открытые) и перелив «вперёд» (период старта уже закрыт) — это и
есть штатный FIFO, поэтому такие сотрудники не флагаются.

Прежний критерий («у отпуска нет ни одной транзакции в периоде с датой
старта») после перехода автосписания на FIFO (#120) вечно флагал легитимный
перелив назад (#124) — он заменён сверкой с эталонным распределением.

Скрипт безопасен для повторного запуска: пересчёт детерминирован, поэтому
повторный запуск даёт тот же результат (идемпотентность).

Запуск (из backend/):
  python scripts/recalculate_misattributed_vacations.py            # отчёт (dry-run)
  python scripts/recalculate_misattributed_vacations.py --apply    # пересчитать
  python scripts/recalculate_misattributed_vacations.py --employee-id 55  # только 1 сотрудника
"""
import argparse
import asyncio
from collections import defaultdict

from sqlalchemy import func, select

from app.core.database import get_db
from app.core.vacation_types import VACATION_TYPE_MAIN
from app.models.employee import Employee
from app.models.vacation import Vacation
from app.models.vacation_period import VacationPeriod
from app.models.vacation_period_manual_closure import VacationPeriodManualClosure
from app.models.vacation_period_transaction import VacationPeriodTransaction
from app.repositories.vacation_period_manual_closure_repository import (
    vacation_period_manual_closure_repository,
)
from app.services.vacation_period_service import vacation_period_service

SCRIPT_VERSION = "3.0.0"


def _available_for_auto(period: VacationPeriod, closure: VacationPeriodManualClosure | None) -> int:
    """Сколько дней периода остаётся доступно автосписанию после ручных закрытий.

    Повторяет логику _reapply_manual_closures: ручное закрытие фиксирует
    использованные дни на момент закрытия (used_at_closure), поэтому ёмкость
    для автосписания = total - used_at_closure. Для закрытий со снапшотом
    доп. дней (#123) рост additional_days переоткрывает период на дельту.
    """
    total = (period.main_days or 0) + (period.additional_days or 0)
    if closure is None:
        return max(total, 0)

    target_remaining = closure.remaining_days if closure.remaining_days is not None else 0
    if closure.additional_days_at_closure is not None:
        total_at_closure = (period.main_days or 0) + closure.additional_days_at_closure
        used_at_closure = max(total_at_closure - target_remaining, 0)
    else:
        used_at_closure = max(total - target_remaining, 0)
    return max(total - used_at_closure, 0)


async def expected_vacation_allocations(db, employee_id: int) -> dict[int, dict[int, int]]:
    """Эталонное FIFO-распределение: {vacation_id: {period_id: дни}}.

    Считается только в памяти и ничего не пишет в БД: ручные закрытия берутся
    из журнала, ёмкость периодов — из их текущих main/additional дней.
    """
    periods = list(
        (
            await db.execute(
                select(VacationPeriod)
                .where(VacationPeriod.employee_id == employee_id)
                .order_by(VacationPeriod.period_start.asc(), VacationPeriod.id.asc())
            )
        )
        .scalars()
        .all()
    )
    if not periods:
        return {}

    closures = await vacation_period_manual_closure_repository.get_by_employee(db, employee_id)
    closure_by_bounds = {(c.work_year_start, c.work_year_end): c for c in closures}
    capacity = {
        period.id: _available_for_auto(period, closure_by_bounds.get((period.period_start, period.period_end)))
        for period in periods
    }

    vacations = list(
        (
            await db.execute(
                select(Vacation)
                .where(
                    Vacation.employee_id == employee_id,
                    Vacation.is_deleted.is_(False),
                    Vacation.order_id.isnot(None),
                    Vacation.vacation_type == VACATION_TYPE_MAIN,
                )
                .order_by(Vacation.start_date.asc(), Vacation.id.asc())
            )
        )
        .scalars()
        .all()
    )

    planned: dict[int, dict[int, int]] = {}
    for vacation in vacations:
        days_to_use = await vacation_period_service.get_effective_vacation_days(db, vacation)
        if days_to_use <= 0:
            continue
        allocation: dict[int, int] = {}
        for period in periods:
            if days_to_use <= 0:
                break
            if capacity[period.id] <= 0:
                continue
            take = min(capacity[period.id], days_to_use)
            allocation[period.id] = take
            capacity[period.id] -= take
            days_to_use -= take
        planned[vacation.id] = allocation
    return planned


async def actual_vacation_allocations(db, employee_id: int) -> dict[int, dict[int, int]]:
    """Фактическое распределение автосписаний: {vacation_id: {period_id: дни}}.

    Дни суммируются со знаком: сторно (vacation_restore, is_reversal) вычитается,
    поэтому для скорректированного отпуска остаётся нетто-распределение — ровно
    то, что recompute_period_totals учитывает в used_days_auto периода.
    """
    result = await db.execute(
        select(
            VacationPeriodTransaction.vacation_id,
            VacationPeriodTransaction.period_id,
            func.sum(VacationPeriodTransaction.days_count),
        )
        .join(VacationPeriod, VacationPeriod.id == VacationPeriodTransaction.period_id)
        .where(
            VacationPeriod.employee_id == employee_id,
            VacationPeriodTransaction.vacation_id.isnot(None),
        )
        .group_by(
            VacationPeriodTransaction.vacation_id,
            VacationPeriodTransaction.period_id,
        )
    )
    actual: dict[int, dict[int, int]] = defaultdict(dict)
    for vacation_id, period_id, days in result.all():
        if days and days > 0:
            actual[vacation_id][period_id] = int(days)
    return dict(actual)


async def find_misattributed_employee_ids(db, employee_id: int | None = None) -> list[int]:
    """Сотрудники, чьи автосписания расходятся с эталонным FIFO-распределением.

    Мизатрибуция — дни отпуска оказались не в тех периодах, которые дал бы
    FIFO (самый старый незакрытый первым), либо списание отсутствует. Перелив
    в более старые или более поздние открытые периоды сам по себе не флагается:
    он входит в эталон.
    """
    query = (
        select(Vacation.employee_id)
        .where(
            Vacation.is_deleted.is_(False),
            Vacation.order_id.isnot(None),
            Vacation.vacation_type == VACATION_TYPE_MAIN,
        )
        .distinct()
        .order_by(Vacation.employee_id)
    )
    if employee_id is not None:
        query = query.where(Vacation.employee_id == employee_id)

    candidate_ids = [row[0] for row in (await db.execute(query)).all()]
    misattributed: list[int] = []
    for candidate_id in candidate_ids:
        expected = await expected_vacation_allocations(db, candidate_id)
        actual = await actual_vacation_allocations(db, candidate_id)
        if expected != actual:
            misattributed.append(candidate_id)
    return misattributed


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

            ids = await find_misattributed_employee_ids(db, employee_id)
            print(f"Сотрудников с расхождением против эталонного FIFO: {len(ids)}")
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
