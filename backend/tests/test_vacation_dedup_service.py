"""Тесты сервиса дедупликации отпусков (#65)."""
from datetime import date

import pytest
from sqlalchemy import select

from app.models.vacation import Vacation
from app.models.vacation_period_transaction import VacationPeriodTransaction
from app.services.vacation_dedup_service import deduplicate_vacations

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _seed_group(
    db_session,
    create_employee,
    create_order,
    create_vacation,
    create_vacation_period,
    *,
    reference_first=True,
    both_referenced=False,
    second_deleted=False,
):
    employee = await create_employee()
    order = await create_order(employee=employee, order_number="100")
    period = await create_vacation_period(employee=employee)

    v1 = await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 5),
        days_count=5,
        vacation_year=2026,
    )
    v2 = await create_vacation(
        employee=employee,
        order_id=order.id,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 5),
        days_count=5,
        vacation_year=2026,
        is_deleted=second_deleted,
    )

    referenced_ids = []
    if reference_first:
        referenced_ids.append(v1.id)
    if both_referenced:
        referenced_ids.append(v2.id)

    for vid in referenced_ids:
        db_session.add(
            VacationPeriodTransaction(
                period_id=period.id,
                vacation_id=vid,
                order_id=order.id,
                order_number=order.order_number,
                days_count=5,
                transaction_type="vacation_use",
                is_reversal=False,
                source_type="vacation",
            )
        )
    await db_session.flush()
    return employee, order, v1, v2


async def _count_vacations(db_session, order_id: int) -> int:
    result = await db_session.execute(
        select(Vacation.id).where(Vacation.order_id == order_id)
    )
    return len(result.all())


async def test_dry_run_reports_group_without_changes(
    db_session, create_employee, create_order, create_vacation, create_vacation_period
):
    employee, order, v1, v2 = await _seed_group(
        db_session, create_employee, create_order, create_vacation, create_vacation_period
    )

    report = await deduplicate_vacations(db_session, apply=False)

    assert not report.aborted
    assert len(report.groups) == 1
    info = report.groups[0]
    assert info["order_id"] == order.id
    assert info["keeper_id"] == v1.id  # строка со ссылками остаётся
    assert info["to_delete_ids"] == [v2.id]
    assert report.deleted == 0
    assert await _count_vacations(db_session, order.id) == 2


async def test_apply_deletes_duplicate_and_keeps_referenced(
    db_session, create_employee, create_order, create_vacation, create_vacation_period
):
    employee, order, v1, v2 = await _seed_group(
        db_session, create_employee, create_order, create_vacation, create_vacation_period
    )

    report = await deduplicate_vacations(db_session, apply=True)

    assert not report.aborted
    assert report.deleted == 1
    assert report.kept == 1
    remaining = (await db_session.execute(select(Vacation).where(Vacation.order_id == order.id))).scalars().all()
    assert [v.id for v in remaining] == [v1.id]


async def test_apply_is_idempotent(
    db_session, create_employee, create_order, create_vacation, create_vacation_period
):
    employee, order, v1, v2 = await _seed_group(
        db_session, create_employee, create_order, create_vacation, create_vacation_period
    )

    await deduplicate_vacations(db_session, apply=True)
    report2 = await deduplicate_vacations(db_session, apply=True)

    assert len(report2.groups) == 0
    assert report2.deleted == 0
    assert await _count_vacations(db_session, order.id) == 1


async def test_without_references_keeps_highest_id(
    db_session, create_employee, create_order, create_vacation, create_vacation_period
):
    employee, order, v1, v2 = await _seed_group(
        db_session,
        create_employee,
        create_order,
        create_vacation,
        create_vacation_period,
        reference_first=False,
    )

    report = await deduplicate_vacations(db_session, apply=True)

    assert not report.aborted
    info = report.groups[0]
    assert info["keeper_id"] == v2.id  # max id
    remaining = (await db_session.execute(select(Vacation).where(Vacation.order_id == order.id))).scalars().all()
    assert [v.id for v in remaining] == [v2.id]


async def test_soft_deleted_row_loses_when_no_references(
    db_session, create_employee, create_order, create_vacation, create_vacation_period
):
    employee, order, v1, v2 = await _seed_group(
        db_session,
        create_employee,
        create_order,
        create_vacation,
        create_vacation_period,
        reference_first=False,
        second_deleted=True,
    )

    report = await deduplicate_vacations(db_session, apply=True)

    assert not report.aborted
    info = report.groups[0]
    # v2 помечен удалённым → keeper — не удалённый v1, несмотря на меньший id
    assert info["keeper_id"] == v1.id


async def test_ambiguous_group_aborts_without_changes(
    db_session, create_employee, create_order, create_vacation, create_vacation_period
):
    employee, order, v1, v2 = await _seed_group(
        db_session,
        create_employee,
        create_order,
        create_vacation,
        create_vacation_period,
        both_referenced=True,
    )

    report = await deduplicate_vacations(db_session, apply=True)

    assert report.aborted
    assert len(report.ambiguous) == 1
    assert report.ambiguous[0]["order_id"] == order.id
    assert report.deleted == 0
    assert await _count_vacations(db_session, order.id) == 2


async def test_group_orders_not_affected(
    db_session, create_employee, create_order, create_vacation
):
    emp1 = await create_employee()
    emp2 = await create_employee()
    order = await create_order(order_number="200")

    await create_vacation(employee=emp1, order_id=order.id)
    await create_vacation(employee=emp2, order_id=order.id)

    report = await deduplicate_vacations(db_session, apply=True)

    assert not report.aborted
    assert len(report.groups) == 0
    assert await _count_vacations(db_session, order.id) == 2
