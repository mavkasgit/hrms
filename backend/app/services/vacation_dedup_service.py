"""Дедупликация отпусков: одна запись на пару (order_id, employee_id).

Используется одноразовым скриптом `backend/scripts/dedup_vacations.py` перед
созданием partial unique index (#67). Логика вынесена в сервис, чтобы её можно
было покрыть pytest.

Правила (#65):
- ищем группы отпусков с одинаковыми (order_id, employee_id) и count > 1;
- оставляем строку со ссылками (vacation_period_transactions /
  vacation_adjustments), иначе — не удалённую с наибольшим id;
- fail-safe: если ссылки в нескольких строках группы → abort всего прогона
  с перечнем групп и без изменений;
- групповые приказы не затрагиваются (у них employee_id различается);
- dry-run по умолчанию, реальное удаление только при apply=True.
"""
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.vacation import Vacation
from app.models.vacation_adjustment import VacationAdjustment
from app.models.vacation_period_transaction import VacationPeriodTransaction


@dataclass
class VacationDedupReport:
    groups: list[dict[str, Any]]
    ambiguous: list[dict[str, Any]]
    deleted: int = 0
    kept: int = 0
    aborted: bool = False


async def _reference_counts(db: AsyncSession, vacation_id: int) -> tuple[int, int]:
    """Сколько транзакций и корректировок ссылается на отпуск."""
    tx_count = (
        await db.execute(
            select(func.count(VacationPeriodTransaction.id)).where(
                VacationPeriodTransaction.vacation_id == vacation_id
            )
        )
    ).scalar() or 0
    adj_count = (
        await db.execute(
            select(func.count(VacationAdjustment.id)).where(
                VacationAdjustment.vacation_id == vacation_id
            )
        )
    ).scalar() or 0
    return int(tx_count), int(adj_count)


def _pick_keeper_without_references(rows: list[Vacation]) -> Vacation:
    """Без ссылок держим не удалённую строку с наибольшим id.

    Отклонение от буквы ТЗ («с наибольшим id») намеренное: если среди дублей
    есть мягко удалённая строка, она невидима в UI, и её «победа» удалила бы
    живую запись. Держим живую строку (максимальный id среди живых), а при
    отсутствии живых — максимальный id вообще.
    """
    non_deleted = [v for v in rows if not v.is_deleted]
    pool = non_deleted if non_deleted else rows
    return max(pool, key=lambda v: v.id)


def _group_info(order_id: int, employee_id: int, rows: list[Vacation], keeper: Vacation) -> dict[str, Any]:
    return {
        "order_id": order_id,
        "employee_id": employee_id,
        "order_number": rows[0].order.order_number if rows[0].order else None,
        "employee_name": rows[0].employee.name if rows[0].employee else None,
        "keeper_id": keeper.id,
        "vacation_ids": sorted(v.id for v in rows),
        "to_delete_ids": sorted(v.id for v in rows if v.id != keeper.id),
    }


async def deduplicate_vacations(db: AsyncSession, apply: bool = False) -> VacationDedupReport:
    report = VacationDedupReport(groups=[], ambiguous=[])

    group_result = await db.execute(
        select(Vacation.order_id, Vacation.employee_id, func.count(Vacation.id).label("cnt"))
        .where(Vacation.order_id.isnot(None))
        .group_by(Vacation.order_id, Vacation.employee_id)
        .having(func.count(Vacation.id) > 1)
        .order_by(Vacation.order_id, Vacation.employee_id)
    )
    groups = [(int(oid), int(eid)) for oid, eid, _cnt in group_result.all()]

    for order_id, employee_id in groups:
        rows_result = await db.execute(
            select(Vacation)
            .options(selectinload(Vacation.order), selectinload(Vacation.employee))
            .where(Vacation.order_id == order_id, Vacation.employee_id == employee_id)
            .order_by(Vacation.id.desc())
        )
        rows = list(rows_result.scalars().all())

        referenced: list[Vacation] = []
        for v in rows:
            tx_count, adj_count = await _reference_counts(db, v.id)
            if tx_count or adj_count:
                referenced.append(v)

        if len(referenced) > 1:
            report.ambiguous.append({"order_id": order_id, "employee_id": employee_id})
            continue

        keeper = referenced[0] if len(referenced) == 1 else _pick_keeper_without_references(rows)
        report.groups.append(_group_info(order_id, employee_id, rows, keeper))

    # Fail-safe: ссылки в нескольких строках группы → abort без изменений.
    if report.ambiguous:
        report.aborted = True
        return report

    report.kept = len(report.groups)

    if not apply:
        return report

    for info in report.groups:
        for vacation_id in info["to_delete_ids"]:
            # По построению удаляемые строки ссылок не имеют (иначе — abort),
            # поэтому прямое удаление безопасно; нарушение инварианта упадёт
            # громкой FK-ошибкой, а не молча подчистит данные.
            vacation = await db.get(Vacation, vacation_id)
            if vacation is not None:
                await db.delete(vacation)
            report.deleted += 1

    await db.commit()

    return report
