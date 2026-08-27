from datetime import date

import pytest
from fastapi import HTTPException

from app.models.vacation_period import VacationPeriod
from app.repositories.vacation_period_repository import VacationPeriodRepository
from app.schemas.vacation_period import VacationPeriodBulkAdjustItem
from app.services.vacation_period_service import auto_use_days, vacation_period_service


pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _periods_by_year(db, employee_id) -> dict[int, VacationPeriod]:
    """Достаёт периоды из БД напрямую, сгруппированные по year_number."""
    periods = await VacationPeriodRepository().get_by_employee(db, employee_id)
    return {p.year_number: p for p in periods}


async def _ensure_periods(db, employee) -> None:
    await vacation_period_service.ensure_periods_for_employee(
        db,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days or 0,
    )


async def test_increase_first_reopens_closed_periods(db_session, create_employee):
    """«С первого»: закрытый период переоткрывается на дельту, открытый получает новые доп. дни."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    p1 = periods[1]

    # Полностью закрываем 1-й год: 24+1=25, used=25, remaining=0
    await vacation_period_service.close_period(db_session, p1.id)
    closed = await VacationPeriodRepository().get_by_id(db_session, p1.id)
    assert closed is not None
    assert closed.remaining_days == 0
    assert closed.additional_days == 1

    # Увеличиваем с самого старого периода: 1 → 3
    adjustment, _ = await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=3,
        from_period="first",
        created_by="test_user",
    )
    assert adjustment.old_value == 1
    assert adjustment.new_value == 3

    after = await _periods_by_year(db_session, employee.id)
    p1_after = after[1]
    assert p1_after.additional_days == 3
    # Инвариант: used не тронут (25), remaining = total - used = (24+3)-25 = 2
    assert p1_after.used_days == 25
    assert p1_after.remaining_days == 2

    # Открытый текущий период получил новые доп. дни
    assert after[3].additional_days == 3


async def test_increase_first_partial_close_grows_remaining(db_session, create_employee):
    """Частично закрытый период: remaining растёт на дельту."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.partial_close_period(db_session, periods[1].id, remaining_days=5)

    partial = await VacationPeriodRepository().get_by_id(db_session, periods[1].id)
    assert partial is not None
    assert partial.remaining_days == 5
    assert partial.used_days == 20  # 25 - 5

    await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=3,
        from_period="first",
        created_by="test_user",
    )

    after = await _periods_by_year(db_session, employee.id)
    p1_after = after[1]
    # used сохранён, remaining = (24+3) - 20 = 7 = 5 + дельта(2)
    assert p1_after.used_days == 20
    assert p1_after.remaining_days == 7


async def test_increase_last_keeps_old_closed_periods(db_session, create_employee):
    """«С последнего»: старые закрытые периоды не тронуты, текущий+будущие обновлены."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.close_period(db_session, periods[1].id)

    closed = await VacationPeriodRepository().get_by_id(db_session, periods[1].id)
    assert closed is not None
    assert closed.remaining_days == 0
    assert closed.additional_days == 1

    await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=3,
        from_period="last",
        created_by="test_user",
    )

    after = await _periods_by_year(db_session, employee.id)
    p1_after = after[1]
    # Старый период не тронут
    assert p1_after.additional_days == 1
    assert p1_after.remaining_days == 0
    # Текущий получил новые доп. дни
    assert after[3].additional_days == 3


async def test_increase_specific_period(db_session, create_employee):
    """«С указанного периода»: периоды >= границы обновлены, старее — нет."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    # Граница — 2-й период
    await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=3,
        from_period="specific",
        period_id=periods[2].id,
        created_by="test_user",
    )

    after = await _periods_by_year(db_session, employee.id)
    assert after[1].additional_days == 1
    assert after[2].additional_days == 3
    assert after[3].additional_days == 3


async def test_increase_specific_period_requires_period_id(db_session, create_employee):
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    with pytest.raises(HTTPException) as exc_info:
        await vacation_period_service.apply_additional_days_increase(
            db_session,
            employee.id,
            new_value=3,
            from_period="specific",
            created_by="test_user",
        )
    assert exc_info.value.status_code == 400


async def test_boundary_prevents_ensure_overwrite(db_session, create_employee):
    """После увеличения «с последнего» ensure_periods_for_employee не перезаписывает старые периоды."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.close_period(db_session, periods[1].id)

    await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=3,
        from_period="last",
        created_by="test_user",
    )

    # Повторный ensure (как при создании отпуска) не должен тронуть старый период
    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        employee.id,
        employee.hire_date,
        employee.additional_vacation_days or 0,
    )

    after = await _periods_by_year(db_session, employee.id)
    assert after[1].additional_days == 1
    assert after[1].remaining_days == 0
    assert after[3].additional_days == 3


async def test_auto_use_debits_reopened_closed_period_first(db_session, create_employee, create_order):
    """FIFO: отпуск списывается с переоткрытого закрытого периода первым."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.close_period(db_session, periods[1].id)

    await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=3,
        from_period="first",
        created_by="test_user",
    )

    order = await create_order(employee=employee, order_number="99")
    await auto_use_days(
        db_session,
        employee.id,
        days_to_use=2,
        hire_date=employee.hire_date,
        additional_days=employee.additional_vacation_days or 0,
        order_id=order.id,
        order_number=order.order_number,
        transaction_type="vacation_use",
        original_order_id=order.id,
    )

    after = await _periods_by_year(db_session, employee.id)
    p1_after = after[1]
    # 2 дня снято с переоткрытого 1-го периода: used 25→27, remaining 2→0
    assert p1_after.used_days == 27
    assert p1_after.remaining_days == 0
    assert p1_after.used_days_auto == 2


async def test_recalculate_keeps_reopened_delta(db_session, create_employee):
    """recalculate_periods не «проглатывает» дельту: переоткрытый период сохраняет remaining = old + delta."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.close_period(db_session, periods[1].id)

    closed = await VacationPeriodRepository().get_by_id(db_session, periods[1].id)
    assert closed is not None
    assert closed.remaining_days == 0

    await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=3,
        from_period="first",
        created_by="test_user",
    )

    reopened = await _periods_by_year(db_session, employee.id)
    assert reopened[1].remaining_days == 2

    # Пересоздание периодов с восстановлением закрытий
    await vacation_period_service.recalculate_periods(db_session, employee.id)

    after = await _periods_by_year(db_session, employee.id)
    p1_after = after[1]
    assert p1_after.additional_days == 3
    # used сохранён (25), remaining = (24+3)-25 = 2 — дельта не абсорбирована
    assert p1_after.used_days == 25
    assert p1_after.remaining_days == 2


async def test_decrease_clamps_remaining_to_zero(db_session, create_employee):
    """Уменьшение: remaining = max(total - used, 0), период дозакрывается до 0."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=5,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    # Закрываем 1-й год: 24+5=29, used=29, remaining=0
    await vacation_period_service.close_period(db_session, periods[1].id)

    # Уменьшаем с первого: 5 → 2. total=26, used=29 > total → remaining=0, used остаётся фактом
    await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=2,
        from_period="first",
        created_by="test_user",
    )

    after = await _periods_by_year(db_session, employee.id)
    p1_after = after[1]
    assert p1_after.additional_days == 2
    assert p1_after.remaining_days == 0
    assert p1_after.used_days == 29


async def test_recalculate_keeps_boundary_old_periods_untouched(db_session, create_employee):
    """recalculate_periods не «уплощает» старые периоды (старее границы) до текущего значения."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.close_period(db_session, periods[1].id)

    # Увеличиваем «с последнего»: старый закрытый период не тронут
    await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=3,
        from_period="last",
        created_by="test_user",
    )

    before = await _periods_by_year(db_session, employee.id)
    assert before[1].additional_days == 1
    assert before[1].remaining_days == 0
    assert before[3].additional_days == 3

    # Пересоздание периодов: старый период сохраняет историческое значение
    await vacation_period_service.recalculate_periods(db_session, employee.id)

    after = await _periods_by_year(db_session, employee.id)
    assert after[1].additional_days == 1
    assert after[1].remaining_days == 0
    assert after[3].additional_days == 3


async def test_adjust_periods_manually_tweaks_specific_periods(db_session, create_employee):
    """Ручная корректировка: один период вверх, другой назад, закрытый переоткрывается."""
    from app.schemas.vacation_period import VacationPeriodBulkAdjustItem

    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    # Закрываем 1-й год
    await vacation_period_service.close_period(db_session, periods[1].id)

    # Сначала массовое применение «с последнего»: 1 → 3 на текущем+будущих
    await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=3,
        from_period="last",
        created_by="test_user",
    )
    before = await _periods_by_year(db_session, employee.id)
    assert before[1].additional_days == 1  # старый не тронут
    assert before[3].additional_days == 3

    # Ручная корректировка: 1-й период → 2 (переоткрытие на 1), 3-й → 1 (откат назад)
    balances = await vacation_period_service.adjust_periods_additional_days(
        db_session,
        employee.id,
        [
            VacationPeriodBulkAdjustItem(period_id=before[1].id, additional_days=2),
            VacationPeriodBulkAdjustItem(period_id=before[3].id, additional_days=1),
        ],
        created_by="test_user",
    )

    after = await _periods_by_year(db_session, employee.id)
    # Закрытый 1-й период переоткрыт на дельту: used=25, total=26, remaining=1
    assert after[1].additional_days == 2
    assert after[1].used_days == 25
    assert after[1].remaining_days == 1
    # 3-й период откачен назад
    assert after[3].additional_days == 1
    # Глобальное значение сотрудника НЕ меняется
    assert employee.additional_vacation_days == 3
    assert len(balances) == len(after)


async def test_adjust_periods_rejects_negative_and_unknown(db_session, create_employee):
    from app.schemas.vacation_period import VacationPeriodBulkAdjustItem

    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)
    periods = await _periods_by_year(db_session, employee.id)

    with pytest.raises(HTTPException) as exc:
        await vacation_period_service.adjust_periods_additional_days(
            db_session,
            employee.id,
            [VacationPeriodBulkAdjustItem(period_id=periods[1].id, additional_days=-1)],
            created_by="test_user",
        )
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        await vacation_period_service.adjust_periods_additional_days(
            db_session,
            employee.id,
            [VacationPeriodBulkAdjustItem(period_id=999_999, additional_days=2)],
            created_by="test_user",
        )
    assert exc.value.status_code == 404


async def test_adjust_periods_no_change_is_noop(db_session, create_employee):
    from app.schemas.vacation_period import VacationPeriodBulkAdjustItem

    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)
    periods = await _periods_by_year(db_session, employee.id)

    balances = await vacation_period_service.adjust_periods_additional_days(
        db_session,
        employee.id,
        [VacationPeriodBulkAdjustItem(period_id=periods[1].id, additional_days=1)],
        created_by="test_user",
    )
    assert len(balances) >= 1

    from sqlalchemy import select
    from app.models.employee import EmployeeAuditLog
    audits = list(
        (
            await db_session.execute(
                select(EmployeeAuditLog).where(
                    EmployeeAuditLog.employee_id == employee.id,
                    EmployeeAuditLog.action == "additional_days_periods",
                )
            )
        ).scalars().all()
    )
    assert len(audits) == 0  # ничего не изменилось — аудит не пишем


async def test_adjust_periods_recorded_in_history_without_shifting_boundary(db_session, create_employee):
    """Точечные правки пишутся в историю (is_period_edit=True), но не двигают границу."""
    from app.repositories.vacation_additional_days_adjustment_repository import (
        vacation_additional_days_adjustment_repository,
    )

    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.close_period(db_session, periods[1].id)

    # Диапазонная правка «с последнего»: 1 → 3
    await vacation_period_service.apply_additional_days_increase(
        db_session, employee.id, new_value=3, from_period="last", created_by="u1"
    )
    boundary_from = await vacation_period_service.get_additional_days_effective_from(db_session, employee.id)
    assert boundary_from == periods[3].period_start

    # Точечная правка 1-го периода: 1 → 2
    await vacation_period_service.adjust_periods_additional_days(
        db_session,
        employee.id,
        [VacationPeriodBulkAdjustItem(period_id=periods[1].id, additional_days=2)],
        created_by="u2",
    )

    # История: 2 записи (диапазонная + точечная), новые → старые
    records = await vacation_additional_days_adjustment_repository.get_by_employee(db_session, employee.id)
    assert len(records) == 2
    assert records[0].is_period_edit is True
    assert records[0].effective_from == periods[1].period_start
    assert records[0].old_value == 1
    assert records[0].new_value == 2
    assert records[1].is_period_edit is False
    assert records[1].new_value == 3

    # Граница НЕ сдвинута: get_latest по-прежнему диапазонная запись
    assert await vacation_period_service.get_additional_days_effective_from(db_session, employee.id) == periods[3].period_start

    # ensure не перезаписывает 1-й период (остаётся 2)
    await vacation_period_service.ensure_periods_for_employee(
        db_session, employee.id, employee.hire_date, employee.additional_vacation_days or 0
    )
    after = await _periods_by_year(db_session, employee.id)
    assert after[1].additional_days == 2
    assert after[1].remaining_days == 1


async def test_increase_records_adjustment_and_audit(db_session, create_employee):
    """Создаётся запись в vacation_additional_days_adjustments и аудит на сотруднике."""
    from sqlalchemy import select

    from app.models.employee import EmployeeAuditLog
    from app.models.vacation_additional_days_adjustment import VacationAdditionalDaysAdjustment

    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    adjustment, _ = await vacation_period_service.apply_additional_days_increase(
        db_session,
        employee.id,
        new_value=3,
        from_period="first",
        reason="Повышение",
        created_by="hr_user",
    )

    assert adjustment.effective_from == employee.hire_date
    assert adjustment.old_value == 1
    assert adjustment.new_value == 3
    assert adjustment.reason == "Повышение"
    assert adjustment.created_by == "hr_user"

    rows = list(
        (
            await db_session.execute(
                select(VacationAdditionalDaysAdjustment).where(
                    VacationAdditionalDaysAdjustment.employee_id == employee.id
                )
            )
        ).scalars().all()
    )
    assert len(rows) == 1

    audits = list(
        (
            await db_session.execute(
                select(EmployeeAuditLog).where(
                    EmployeeAuditLog.employee_id == employee.id,
                    EmployeeAuditLog.action == "additional_days_adjust",
                )
            )
        ).scalars().all()
    )
    assert len(audits) == 1
    assert audits[0].changed_fields["new_value"] == 3


async def test_increase_requires_hire_date_and_periods(db_session, create_employee):
    employee = await create_employee(
        hire_date=None,
        additional_vacation_days=1,
    )

    with pytest.raises(HTTPException) as exc_info:
        await vacation_period_service.apply_additional_days_increase(
            db_session,
            employee.id,
            new_value=3,
            from_period="first",
            created_by="test_user",
        )
    assert exc_info.value.status_code == 400


async def test_increase_rejects_negative_value(db_session, create_employee):
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    with pytest.raises(HTTPException) as exc_info:
        await vacation_period_service.apply_additional_days_increase(
            db_session,
            employee.id,
            new_value=-1,
            from_period="first",
            created_by="test_user",
        )
    assert exc_info.value.status_code == 400


async def test_adjust_periods_single_period_reopen_repeat_reclose(db_session, create_employee):
    """Ручная правка ОДНОГО периода: переоткрытие → повторное увеличение → откат до закрытия."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.close_period(db_session, periods[1].id)
    p1 = await VacationPeriodRepository().get_by_id(db_session, periods[1].id)
    assert p1 is not None
    assert p1.remaining_days == 0

    # 1 → 2: переоткрытие на дельту 1
    await vacation_period_service.adjust_periods_additional_days(
        db_session,
        employee.id,
        [VacationPeriodBulkAdjustItem(period_id=p1.id, additional_days=2)],
        created_by="test_user",
    )
    after1 = await VacationPeriodRepository().get_by_id(db_session, p1.id)
    assert after1 is not None
    assert after1.used_days == 25
    assert after1.remaining_days == 1

    # 2 → 3 (повторно): остаток растёт до 2
    await vacation_period_service.adjust_periods_additional_days(
        db_session,
        employee.id,
        [VacationPeriodBulkAdjustItem(period_id=p1.id, additional_days=3)],
        created_by="test_user",
    )
    after2 = await VacationPeriodRepository().get_by_id(db_session, p1.id)
    assert after2 is not None
    assert after2.used_days == 25
    assert after2.remaining_days == 2

    # 3 → 1 (откат до исходного): период снова полностью закрыт
    await vacation_period_service.adjust_periods_additional_days(
        db_session,
        employee.id,
        [VacationPeriodBulkAdjustItem(period_id=p1.id, additional_days=1)],
        created_by="test_user",
    )
    after3 = await VacationPeriodRepository().get_by_id(db_session, p1.id)
    assert after3 is not None
    assert after3.additional_days == 1
    assert after3.used_days == 25
    assert after3.remaining_days == 0


async def test_increase_all_ranges_repeated_history_and_final_state(db_session, create_employee):
    """Все диапазоны подряд (первый → последний → выбранный): история + итоговое состояние."""
    from app.repositories.vacation_additional_days_adjustment_repository import (
        vacation_additional_days_adjustment_repository,
    )

    employee = await create_employee(
        hire_date=date(2020, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    # 1. «с первого»: все периоды → 2
    await vacation_period_service.apply_additional_days_increase(
        db_session, employee.id, new_value=2, from_period="first", created_by="u1"
    )
    # 2. «с последнего»: текущий+будущие → 4
    await vacation_period_service.apply_additional_days_increase(
        db_session, employee.id, new_value=4, from_period="last", created_by="u2"
    )
    # 3. «с указанного» (2-й период): 2-й и далее → 5
    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.apply_additional_days_increase(
        db_session, employee.id, new_value=5, from_period="specific", period_id=periods[2].id, created_by="u3"
    )

    after = await _periods_by_year(db_session, employee.id)
    # 1-й период не трогали последние две операции
    assert after[1].additional_days == 2
    # 2-й и далее — последнее значение
    for year in range(2, max(after) + 1):
        assert after[year].additional_days == 5

    # Глобальное значение сотрудника — последнее
    assert employee.additional_vacation_days == 5

    # История: 3 записи, новые → старые
    records = await vacation_additional_days_adjustment_repository.get_by_employee(db_session, employee.id)
    assert len(records) == 3
    assert [r.new_value for r in records] == [5, 4, 2]
    assert [r.old_value for r in records] == [4, 2, 1]
    assert [r.created_by for r in records] == ["u3", "u2", "u1"]

    # Граница держится: повторный ensure не перезаписывает 1-й период
    await vacation_period_service.ensure_periods_for_employee(
        db_session, employee.id, employee.hire_date, 5
    )
    after_ensure = await _periods_by_year(db_session, employee.id)
    assert after_ensure[1].additional_days == 2


async def test_increase_then_decrease_same_range_repeated_closes_period(db_session, create_employee):
    """Повторные изменения одного диапазона: увеличение → откат до закрытия → снова увеличение."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.close_period(db_session, periods[1].id)

    # «с первого»: 1 → 3 — переоткрытие на 2
    await vacation_period_service.apply_additional_days_increase(
        db_session, employee.id, new_value=3, from_period="first", created_by="u1"
    )
    p1 = await VacationPeriodRepository().get_by_id(db_session, periods[1].id)
    assert p1 is not None
    assert p1.used_days == 25
    assert p1.remaining_days == 2

    # снова «с первого»: 3 → 1 — откат до исходного, период снова закрыт
    await vacation_period_service.apply_additional_days_increase(
        db_session, employee.id, new_value=1, from_period="first", created_by="u2"
    )
    p1b = await VacationPeriodRepository().get_by_id(db_session, periods[1].id)
    assert p1b is not None
    assert p1b.additional_days == 1
    assert p1b.used_days == 25
    assert p1b.remaining_days == 0

    # ещё раз «с первого»: 1 → 4 — снова переоткрытие, уже на 3
    await vacation_period_service.apply_additional_days_increase(
        db_session, employee.id, new_value=4, from_period="first", created_by="u3"
    )
    p1c = await VacationPeriodRepository().get_by_id(db_session, periods[1].id)
    assert p1c is not None
    assert p1c.additional_days == 4
    assert p1c.used_days == 25
    assert p1c.remaining_days == 3


async def test_adjust_periods_then_bulk_overrides_manual(db_session, create_employee):
    """Ручная правка периода, затем массовая «с первого» — массовая применяется к диапазону (повторно)."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.close_period(db_session, periods[1].id)

    # ручная: 1-й период → 2 (переоткрытие на 1)
    await vacation_period_service.adjust_periods_additional_days(
        db_session,
        employee.id,
        [VacationPeriodBulkAdjustItem(period_id=periods[1].id, additional_days=2)],
        created_by="test_user",
    )
    p1 = await VacationPeriodRepository().get_by_id(db_session, periods[1].id)
    assert p1 is not None
    assert p1.remaining_days == 1

    # массовая «с первого»: все → 4 — перекрывает ручную правку
    await vacation_period_service.apply_additional_days_increase(
        db_session, employee.id, new_value=4, from_period="first", created_by="u1"
    )
    after = await _periods_by_year(db_session, employee.id)
    assert after[1].additional_days == 4
    assert after[1].used_days == 25
    assert after[1].remaining_days == 3


async def test_adjust_periods_repeated_single_period_stays_consistent_with_fifo(db_session, create_employee, create_order):
    """Повторная ручная правка одного периода + автосписание списывает с переоткрытого остатка."""
    employee = await create_employee(
        hire_date=date(2024, 1, 15),
        additional_vacation_days=1,
    )
    await _ensure_periods(db_session, employee)

    periods = await _periods_by_year(db_session, employee.id)
    await vacation_period_service.close_period(db_session, periods[1].id)

    # переоткрытие на 2
    await vacation_period_service.adjust_periods_additional_days(
        db_session,
        employee.id,
        [VacationPeriodBulkAdjustItem(period_id=periods[1].id, additional_days=3)],
        created_by="test_user",
    )
    reopened = await _periods_by_year(db_session, employee.id)
    assert reopened[1].remaining_days == 2

    # автосписание 2 дней → уходит с переоткрытого 1-го периода (FIFO)
    order = await create_order(employee=employee, order_number="77")
    await auto_use_days(
        db_session,
        employee.id,
        days_to_use=2,
        hire_date=employee.hire_date,
        additional_days=employee.additional_vacation_days or 0,
        order_id=order.id,
        order_number=order.order_number,
        transaction_type="vacation_use",
        original_order_id=order.id,
    )

    after = await _periods_by_year(db_session, employee.id)
    assert after[1].used_days == 27
    assert after[1].remaining_days == 0