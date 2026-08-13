"""ВРЕМЕННЫЙ ТЕСТ (первый на очереди к удалению).

Починка испорченного remaining_days: не разрушает историю ручных закрытий.

Проверяет, что сброс remaining_days в NULL у открытых периодов (без ручного
закрытия) не трогает транзакции — даты и описания ручных закрытий остаются
как были, а закрытые периоды не затрагиваются вообще.
"""
from datetime import date

import pytest
from sqlalchemy import select, update

from app.models.vacation_period import VacationPeriod
from app.models.vacation_period_transaction import VacationPeriodTransaction
from app.repositories.vacation_period_repository import VacationPeriodRepository

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _run_repair(db) -> list[int]:
    """Тот же UPDATE, что делает scripts/repair_vacation_periods.py."""
    manual_tx_periods = (
        select(VacationPeriodTransaction.period_id)
        .where(
            VacationPeriodTransaction.transaction_type.in_(("manual_close", "partial_close"))
        )
        .subquery()
    )
    result = await db.execute(
        select(VacationPeriod.id).where(
            VacationPeriod.remaining_days.isnot(None),
            ~VacationPeriod.id.in_(select(manual_tx_periods.c.period_id)),
        )
    )
    ids = [row[0] for row in result.all()]
    if ids:
        await db.execute(
            update(VacationPeriod)
            .where(VacationPeriod.id.in_(ids))
            .values(remaining_days=None)
        )
    return ids


async def test_repair_resets_marker_and_preserves_history(
    db_session,
    create_employee,
    create_vacation_period,
):
    repo = VacationPeriodRepository()
    employee = await create_employee(hire_date=date(2024, 1, 15))

    # Закрытый период (год 1) с ручным закрытием.
    closed = await create_vacation_period(
        employee=employee,
        period_start=date(2024, 1, 15),
        period_end=date(2025, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=24,
        used_days_manual=24,
        remaining_days=0,
        year_number=1,
    )
    closure_tx = await repo.add_transaction(
        db_session,
        period_id=closed.id,
        days_count=24,
        transaction_type="manual_close",
        description="Закрытие периода: списано 24 дней",
        source_type="manual_close",
    )
    await db_session.commit()
    closure_created_at = closure_tx.created_at

    # Открытый период (год 2), испорченный remaining_days=21, с автосписанием.
    open_period = await create_vacation_period(
        employee=employee,
        period_start=date(2025, 1, 15),
        period_end=date(2026, 1, 14),
        main_days=24,
        additional_days=0,
        used_days=5,
        used_days_auto=5,
        remaining_days=21,
        year_number=2,
    )
    vacation_tx = await repo.add_transaction(
        db_session,
        period_id=open_period.id,
        days_count=5,
        transaction_type="vacation_use",
        order_id=None,
        order_number="102-л",
        description="Автосписание по приказу №102-л: 5 дней",
        source_type="vacation",
    )
    await db_session.commit()
    vacation_created_at = vacation_tx.created_at

    # Починка (сброс remaining_days).
    affected_ids = await _run_repair(db_session)
    await db_session.commit()

    assert affected_ids == [open_period.id]  # затронут только открытый период

    await db_session.refresh(open_period)
    await db_session.refresh(closed)

    # Открытый период: маркер сброшен, списанные дни не тронуты.
    assert open_period.remaining_days is None
    assert open_period.used_days == 5
    assert open_period.used_days_auto == 5

    # Закрытый период не тронут.
    assert closed.remaining_days == 0
    assert closed.used_days == 24

    # Транзакции не тронуты: даты и описания сохранились.
    closure_after = await db_session.get(VacationPeriodTransaction, closure_tx.id)
    assert closure_after.created_at == closure_created_at
    assert closure_after.description == "Закрытие периода: списано 24 дней"
    assert closure_after.days_count == 24
    assert closure_after.source_type == "manual_close"

    vacation_after = await db_session.get(VacationPeriodTransaction, vacation_tx.id)
    assert vacation_after.created_at == vacation_created_at
    assert vacation_after.description == "Автосписание по приказу №102-л: 5 дней"
    assert vacation_after.days_count == 5
