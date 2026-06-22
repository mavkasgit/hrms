from datetime import date

import pytest
from sqlalchemy import select

from app.models.vacation_adjustment import VacationAdjustment
from app.models.vacation_period_manual_closure import VacationPeriodManualClosure
from app.models.vacation_period_transaction import VacationPeriodTransaction
from app.schemas.order import OrderCreate
from app.services.order_service import order_service
from app.services.vacation_period_service import vacation_period_service
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
            "comment": "ledger-test",
        },
        "admin",
    )


async def _net_days_for_vacation(db_session, vacation_id: int) -> int:
    tx_result = await db_session.execute(
        select(VacationPeriodTransaction).where(VacationPeriodTransaction.vacation_id == vacation_id)
    )
    txs = list(tx_result.scalars().all())
    return sum(t.days_count for t in txs)


async def test_recall_creates_reversal_and_adjusted_use(db_session, create_employee):
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 4, 1), date(2026, 4, 11))
    vacation_id = created["id"]

    await vacation_service.recall_vacation(
        db_session,
        vacation_id,
        {
            "recall_date": date(2026, 4, 5),
            "order_date": date(2026, 4, 4),
            "order_number": "R-100",
            "comment": "recall for ledger",
        },
        "admin",
    )

    adj_result = await db_session.execute(
        select(VacationAdjustment).where(VacationAdjustment.vacation_id == vacation_id)
    )
    adjustments = list(adj_result.scalars().all())
    assert len(adjustments) == 1
    adjustment = adjustments[0]
    assert adjustment.original_days == 11
    assert adjustment.actual_days == 4
    assert adjustment.days_returned == 7

    tx_result = await db_session.execute(
        select(VacationPeriodTransaction).where(VacationPeriodTransaction.vacation_id == vacation_id)
    )
    txs = list(tx_result.scalars().all())
    restore_txs = [tx for tx in txs if tx.transaction_type == "vacation_restore"]
    assert any(tx.order_number == "R-100" for tx in restore_txs)
    assert any(tx.transaction_type == "vacation_restore" and tx.is_reversal for tx in txs)
    assert any(tx.transaction_type == "vacation_use_adjusted" and tx.days_count > 0 for tx in txs)
    assert sum(tx.days_count for tx in txs) == 4


async def test_adjustment_is_idempotent_by_adjustment_order_id(db_session, create_employee):
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 5, 1), date(2026, 5, 10))
    vacation_id = created["id"]

    order_type = await order_service.get_order_type_by_code(db_session, "vacation_recall")
    order = await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=order_type.id,
            order_date=date(2026, 5, 5),
            order_number="R-200",
            notes="idempotency",
            extra_fields={},
        ),
    )

    await vacation_service.apply_vacation_adjustment(
        db_session,
        vacation_id=vacation_id,
        adjustment_order_id=order.id,
        adjustment_type="recall",
        actual_start_date=date(2026, 5, 1),
        actual_end_date=date(2026, 5, 4),
        actual_days=4,
        reason="idempotency-pass-1",
    )
    first_net = await _net_days_for_vacation(db_session, vacation_id)

    await vacation_service.apply_vacation_adjustment(
        db_session,
        vacation_id=vacation_id,
        adjustment_order_id=order.id,
        adjustment_type="recall",
        actual_start_date=date(2026, 5, 1),
        actual_end_date=date(2026, 5, 4),
        actual_days=4,
        reason="idempotency-pass-2",
    )
    second_net = await _net_days_for_vacation(db_session, vacation_id)

    adj_result = await db_session.execute(
        select(VacationAdjustment).where(
            VacationAdjustment.vacation_id == vacation_id,
            VacationAdjustment.adjustment_order_id == order.id,
        )
    )
    assert len(list(adj_result.scalars().all())) == 1
    assert first_net == second_net == 4


async def test_extension_keeps_vacation_days_and_only_extends_period(db_session, create_employee):
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 3, 1), date(2026, 3, 10))
    vacation_id = created["id"]

    await vacation_service.extend_vacation(
        db_session,
        vacation_id,
        {
            "order_date": date(2026, 3, 6),
            "order_number": "E-300",
            "sick_start_date": date(2026, 3, 3),
            "sick_end_date": date(2026, 3, 6),
            "comment": "extend by 4 days",
        },
        "admin",
    )

    adj_result = await db_session.execute(
        select(VacationAdjustment).where(VacationAdjustment.vacation_id == vacation_id)
    )
    adjustment = adj_result.scalars().one()
    assert adjustment.original_days == 10
    assert adjustment.actual_days == 10
    assert adjustment.days_added == 0
    assert await _net_days_for_vacation(db_session, vacation_id) == 10

    vacation = await vacation_service.get_employee_vacation_history(db_session, employee.id)
    comments = [v["comment"] for year in vacation["years"] for v in year["vacations"] if v["id"] == vacation_id]
    assert comments
    assert "Продление по приказу №E-300" in (comments[0] or "")
    assert "было 10 дн., стало 10 дн., продлено 4 дн." in (comments[0] or "")


async def test_postpone_reduces_effective_days_via_adjustment(db_session, create_employee):
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 2, 1), date(2026, 2, 10))
    vacation_id = created["id"]

    response = await vacation_service.postpone_vacation(
        db_session,
        vacation_id,
        {
            "order_date": date(2026, 2, 5),
            "order_number": "P-400",
            "start_date": date(2026, 2, 8),
            "end_date": date(2026, 2, 10),
            "comment": "postpone part",
        },
        "admin",
    )

    adj_result = await db_session.execute(
        select(VacationAdjustment).where(VacationAdjustment.vacation_id == vacation_id)
    )
    adjustment = adj_result.scalars().one()
    assert adjustment.original_days == 10
    assert adjustment.actual_days == 7
    assert adjustment.days_returned == 3
    assert await _net_days_for_vacation(db_session, vacation_id) == 7

    vacation = await vacation_service.get_employee_vacation_history(db_session, employee.id)
    comments = [v["comment"] for year in vacation["years"] for v in year["vacations"] if v["id"] == vacation_id]
    assert comments
    assert "Перенос по приказу №P-400" in (comments[0] or "")
    assert "было 10 дн., стало 7 дн., перенесено 3 дн." in (comments[0] or "")


async def test_recalculate_periods_reapplies_manual_closures(db_session, create_employee):
    employee = await create_employee(hire_date=date(2024, 1, 15), additional_vacation_days=0)
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 1, 1), date(2026, 1, 5))

    periods = await vacation_period_service.get_employee_periods(db_session, employee.id)
    period_year_1 = next(p for p in periods if p.year_number == 1)
    await vacation_period_service.close_period(db_session, period_year_1.period_id)

    await vacation_service.recall_vacation(
        db_session,
        created["id"],
        {
            "recall_date": date(2026, 1, 3),
            "order_date": date(2026, 1, 2),
            "order_number": "R-500",
            "comment": "recall before recalc",
        },
        "admin",
    )

    closure_result = await db_session.execute(
        select(VacationPeriodManualClosure).where(VacationPeriodManualClosure.employee_id == employee.id)
    )
    closures_before = list(closure_result.scalars().all())
    assert len(closures_before) >= 1

    await vacation_period_service.recalculate_periods(db_session, employee.id)

    closure_result_after = await db_session.execute(
        select(VacationPeriodManualClosure).where(VacationPeriodManualClosure.employee_id == employee.id)
    )
    closures_after = list(closure_result_after.scalars().all())
    assert len(closures_after) == len(closures_before)

    tx_result = await db_session.execute(
        select(VacationPeriodTransaction).where(
            VacationPeriodTransaction.manual_closure_id.isnot(None),
            VacationPeriodTransaction.source_type == "manual_closure_rebuild",
        )
    )
    rebuilt_manual_txs = list(tx_result.scalars().all())
    assert len(rebuilt_manual_txs) >= 1

    # Регрессия: после reapply ручных закрытий used_days не должен
    # превышать лимит периода (исключаем задвоение auto + manual).
    periods_after = await vacation_period_service.get_employee_periods(db_session, employee.id)
    for period in periods_after:
        period_limit = period.main_days + period.additional_days
        assert period.used_days <= period_limit


async def test_delete_order_recomputes_only_affected_periods_without_full_rebuild(
    db_session,
    create_employee,
):
    employee = await create_employee(hire_date=date(2024, 5, 23), additional_vacation_days=2)

    created = await _create_paid_vacation(
        db_session,
        employee.id,
        date(2026, 1, 1),
        date(2026, 1, 26),
    )
    order_id = created["order_id"]

    before = await vacation_period_service.get_employee_periods(db_session, employee.id)
    before_ids = [p.period_id for p in before]
    assert order_id is not None
    assert any(p.used_days > 0 for p in before)

    await order_service.hard_delete_order(db_session, order_id)

    after = await vacation_period_service.get_employee_periods(db_session, employee.id)
    after_ids = [p.period_id for p in after]

    # Периоды не пересоздаются "с нуля": id остаются теми же.
    assert before_ids == after_ids
    # Удалённый приказ больше не влияет на использованные дни.
    assert sum(p.used_days for p in after) == 0
    # Дублирования "manual + auto" после удаления быть не должно.
    for period in after:
        period_limit = period.main_days + period.additional_days
        assert period.used_days <= period_limit


async def test_delete_recall_order_restores_vacation_state(db_session, create_employee):
    from app.models.vacation import Vacation
    from app.models.order import Order

    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 4, 1), date(2026, 4, 11))
    vacation_id = created["id"]
    original_order_id = created["order_id"]

    # Выполняем отзыв отпуска
    await vacation_service.recall_vacation(
        db_session,
        vacation_id,
        {
            "recall_date": date(2026, 4, 5),
            "order_date": date(2026, 4, 4),
            "order_number": "R-DELETE-TEST",
            "comment": "recall to delete",
        },
        "admin",
    )

    # Проверяем состояние перед удалением
    vac_db = await db_session.get(Vacation, vacation_id)
    assert vac_db.is_recalled is True
    assert vac_db.recall_order_id is not None
    recall_order_id = vac_db.recall_order_id

    # Удаляем приказ об отзыве
    await order_service.hard_delete_order(db_session, recall_order_id)

    # Проверяем после удаления
    await db_session.close() # Закроем и откроем сессию, чтобы обновить состояние ORM
    vac_db = await db_session.get(Vacation, vacation_id)
    
    # 1. Отпуск не должен быть удален
    assert vac_db is not None
    assert vac_db.order_id == original_order_id
    
    # 2. Состояние отзыва должно быть отменено
    assert vac_db.is_recalled is False
    assert vac_db.recall_date is None
    assert vac_db.recall_order_id is None

    # 3. Корректировка отзыва должна быть удалена
    adj_result = await db_session.execute(
        select(VacationAdjustment).where(VacationAdjustment.adjustment_order_id == recall_order_id)
    )
    assert len(list(adj_result.scalars().all())) == 0

    # 4. Тразакции отзыва должны быть удалены
    tx_result = await db_session.execute(
        select(VacationPeriodTransaction).where(
            VacationPeriodTransaction.adjustment_order_id == recall_order_id
        )
    )
    assert len(list(tx_result.scalars().all())) == 0

    # 5. Сам приказ должен быть удален
    order_db = await db_session.get(Order, recall_order_id)
    assert order_db is None


async def test_delete_postpone_order_restores_vacation_state(db_session, create_employee):
    from app.models.vacation import Vacation
    from app.models.order import Order

    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 2, 1), date(2026, 2, 10))
    vacation_id = created["id"]
    original_order_id = created["order_id"]

    # Выполняем перенос части отпуска
    await vacation_service.postpone_vacation(
        db_session,
        vacation_id,
        {
            "order_date": date(2026, 2, 5),
            "order_number": "P-DELETE-TEST",
            "start_date": date(2026, 2, 8),
            "end_date": date(2026, 2, 10),
            "comment": "some manual comment",
        },
        "admin",
    )

    # Проверяем состояние перед удалением
    vac_db = await db_session.get(Vacation, vacation_id)
    assert vac_db.is_postponed is True
    assert vac_db.postpone_order_id is not None
    postpone_order_id = vac_db.postpone_order_id
    assert "Перенос по приказу №P-DELETE-TEST" in vac_db.comment

    # Удаляем приказ о переносе
    await order_service.hard_delete_order(db_session, postpone_order_id)

    # Проверяем после удаления
    await db_session.close()
    vac_db = await db_session.get(Vacation, vacation_id)

    # 1. Отпуск не должен быть удален
    assert vac_db is not None
    assert vac_db.order_id == original_order_id

    # 2. Состояние переноса должно быть отменено
    assert vac_db.is_postponed is False
    assert vac_db.postpone_order_id is None

    # 3. Авто-комментарий должен быть удален, а ручной комментарий остаться
    assert "Перенос по приказу №P-DELETE-TEST" not in vac_db.comment
    assert "some manual comment" in vac_db.comment

    # 4. Корректировка и транзакции должны быть удалены
    adj_result = await db_session.execute(
        select(VacationAdjustment).where(VacationAdjustment.adjustment_order_id == postpone_order_id)
    )
    assert len(list(adj_result.scalars().all())) == 0

    tx_result = await db_session.execute(
        select(VacationPeriodTransaction).where(
            VacationPeriodTransaction.adjustment_order_id == postpone_order_id
        )
    )
    assert len(list(tx_result.scalars().all())) == 0

    # 5. Приказ должен быть удален
    order_db = await db_session.get(Order, postpone_order_id)
    assert order_db is None


async def test_delete_extension_order_restores_vacation_state(db_session, create_employee):
    from app.models.vacation import Vacation
    from app.models.order import Order

    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 3, 1), date(2026, 3, 10))
    vacation_id = created["id"]
    original_order_id = created["order_id"]

    # Выполняем продление отпуска
    await vacation_service.extend_vacation(
        db_session,
        vacation_id,
        {
            "order_date": date(2026, 3, 6),
            "order_number": "E-DELETE-TEST",
            "sick_start_date": date(2026, 3, 3),
            "sick_end_date": date(2026, 3, 6),
            "comment": "extend manual comment",
        },
        "admin",
    )

    # Проверяем состояние перед удалением
    vac_db = await db_session.get(Vacation, vacation_id)
    assert vac_db.is_extended is True
    assert vac_db.extension_order_id is not None
    extension_order_id = vac_db.extension_order_id
    assert "Продление по приказу №E-DELETE-TEST" in vac_db.comment

    # Удаляем приказ о продлении
    await order_service.hard_delete_order(db_session, extension_order_id)

    # Проверяем после удаления
    await db_session.close()
    vac_db = await db_session.get(Vacation, vacation_id)

    # 1. Отпуск не должен быть удален
    assert vac_db is not None
    assert vac_db.order_id == original_order_id

    # 2. Состояние продления должно быть отменено
    assert vac_db.is_extended is False
    assert vac_db.extension_order_id is None

    # 3. Авто-комментарий должен быть удален, а ручной комментарий остаться
    assert "Продление по приказу №E-DELETE-TEST" not in vac_db.comment
    assert "extend manual comment" in vac_db.comment

    # 4. Корректировка и транзакции должны быть удалены
    adj_result = await db_session.execute(
        select(VacationAdjustment).where(VacationAdjustment.adjustment_order_id == extension_order_id)
    )
    assert len(list(adj_result.scalars().all())) == 0

    tx_result = await db_session.execute(
        select(VacationPeriodTransaction).where(
            VacationPeriodTransaction.adjustment_order_id == extension_order_id
        )
    )
    assert len(list(tx_result.scalars().all())) == 0

    # 5. Приказ должен быть удален
    order_db = await db_session.get(Order, extension_order_id)
    assert order_db is None
