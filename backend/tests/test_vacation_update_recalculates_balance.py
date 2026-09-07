"""Регрессия: update_vacation должен пересчитывать баланс при изменении дат.

До фикса (.agents/plans/vacation-update-balance-fix.md):
- update_vacation удалял старый приказ → vacation_period_transactions
  с original_order_id=<старый> удалялись вместе с ним.
- Новый приказ создавался через _create_linked_order(skip_auto_vacation=True),
  без вызова auto_use_days → used_days_auto периода оставался прежним.

После фикса update_vacation вызывает reverse_vacation_auto_transactions +
reapply_vacation_days по образцу recall_vacation.

Дни считаются календарные (calculate_vacation_days = календарные − праздники).
"""
from datetime import date

import pytest
from sqlalchemy import select

from app.core.exceptions import VacationTypeChangeForbiddenError
from app.models.vacation import Vacation
from app.models.vacation_adjustment import VacationAdjustment
from app.models.vacation_period import VacationPeriod
from app.models.vacation_period_transaction import VacationPeriodTransaction
from app.services.vacation_service import vacation_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _create_paid_vacation(db_session, employee_id: int, start: date, end: date) -> dict:
    return await vacation_service.create_vacation(
        db_session,
        {
            "employee_id": employee_id,
            "start_date": start,
            "end_date": end,
            "vacation_type": "Трудовой",
            "comment": "update-recalc test",
        },
        "admin",
    )


async def _used_days(db_session, employee_id: int, period_index: int = 0) -> int:
    db_session.expire_all()
    result = await db_session.execute(
        select(VacationPeriod)
        .where(VacationPeriod.employee_id == employee_id)
        .order_by(VacationPeriod.period_start.asc())
    )
    periods = list(result.scalars().all())
    return periods[period_index].used_days or 0


async def _net_tx_days_for_vacation(db_session, vacation_id: int) -> int:
    db_session.expire_all()
    result = await db_session.execute(
        select(VacationPeriodTransaction).where(VacationPeriodTransaction.vacation_id == vacation_id)
    )
    return sum(tx.days_count for tx in result.scalars().all())


async def test_update_extends_dates_reapplies_balance(db_session, create_employee):
    """7 → 14 дней: used_days периода растёт на 7."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 4, 1), date(2026, 4, 7))
    vacation_id = created["id"]
    used_before = await _used_days(db_session, employee.id)
    assert used_before == 7

    await vacation_service.update_vacation(
        db_session,
        vacation_id,
        {"start_date": date(2026, 4, 1), "end_date": date(2026, 4, 14)},
        "admin",
    )
    await db_session.commit()  # гарантируем свежий snapshot

    used_after = await _used_days(db_session, employee.id)
    assert used_after == used_before + 7
    net = await _net_tx_days_for_vacation(db_session, vacation_id)
    assert net == 14


async def test_update_shortens_dates_returns_balance(db_session, create_employee):
    """14 → 7 дней: used_days периода уменьшается на 7."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 4, 1), date(2026, 4, 14))
    vacation_id = created["id"]
    used_before = await _used_days(db_session, employee.id)
    assert used_before == 14

    await vacation_service.update_vacation(
        db_session,
        vacation_id,
        {"start_date": date(2026, 4, 1), "end_date": date(2026, 4, 7)},
        "admin",
    )
    await db_session.commit()

    used_after = await _used_days(db_session, employee.id)
    assert used_after == used_before - 7
    net = await _net_tx_days_for_vacation(db_session, vacation_id)
    assert net == 7


async def test_update_type_change_forbidden(db_session, create_employee):
    """Смена vacation_type через update запрещена — guard ADR-0012/Q2."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 4, 1), date(2026, 4, 7))

    with pytest.raises(VacationTypeChangeForbiddenError, match="Смена vacation_type через update запрещена"):
        await vacation_service.update_vacation(
            db_session,
            created["id"],
            {"start_date": date(2026, 4, 1), "end_date": date(2026, 4, 7), "vacation_type": "За свой счет"},
            "admin",
        )

    used = await _used_days(db_session, employee.id)
    assert used == 7


async def test_update_writes_adjustment_ledger_row(db_session, create_employee):
    """update_vacation пишет VacationAdjustment с adjustment_type='adjustment'."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 4, 1), date(2026, 4, 7))
    vacation_id = created["id"]

    await vacation_service.update_vacation(
        db_session,
        vacation_id,
        {"start_date": date(2026, 4, 1), "end_date": date(2026, 4, 14)},
        "admin",
    )
    await db_session.commit()

    db_session.expire_all()
    result = await db_session.execute(
        select(VacationAdjustment).where(
            VacationAdjustment.vacation_id == vacation_id,
            VacationAdjustment.adjustment_type == "adjustment",
        )
    )
    adjustments = list(result.scalars().all())
    assert len(adjustments) == 1
    adj = adjustments[0]
    assert adj.original_days == 7
    assert adj.actual_days == 14
    assert adj.days_added == 7
    assert adj.days_returned == 0
    assert adj.original_order_id != adj.adjustment_order_id


async def test_update_keeps_single_active_transaction_after_reapply(db_session, create_employee):
    """После update: пара restore + adjusted_use, net = новый days_count."""
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 4, 1), date(2026, 4, 7))
    vacation_id = created["id"]
    old_order_id = created["order_id"]

    await vacation_service.update_vacation(
        db_session,
        vacation_id,
        {"start_date": date(2026, 4, 1), "end_date": date(2026, 4, 14)},
        "admin",
    )
    await db_session.commit()

    db_session.expire_all()
    result = await db_session.execute(
        select(VacationPeriodTransaction).where(VacationPeriodTransaction.vacation_id == vacation_id)
    )
    txs = list(result.scalars().all())
    reverses = [tx for tx in txs if tx.is_reversal]
    reapplies = [tx for tx in txs if not tx.is_reversal]
    assert any(tx.days_count < 0 for tx in reverses), "Должна быть транзакция сторно"
    assert any(tx.transaction_type == "vacation_use_adjusted" for tx in reapplies), "Должна быть reapply"
    assert sum(tx.days_count for tx in txs) == 14

    vacation_result = await db_session.execute(select(Vacation).where(Vacation.id == vacation_id))
    vacation = vacation_result.scalar_one()
    assert vacation.days_count == 14
    assert vacation.order_id != old_order_id