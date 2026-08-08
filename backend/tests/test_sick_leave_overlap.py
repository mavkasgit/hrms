"""Поведение пересечения больничных.

Согласовано в grilling (issue #43):
- Соседние периоды (конец одного == начало другого) разрешены — общий день.
- Реальное пересечение (новый начался раньше конца старого) — по-прежнему ошибка.
- Однодневный больничный на границе разрешён.
- День, принадлежащий двум больничным, в статистике считается один раз.
"""

from datetime import date

import pytest

from app.core.exceptions import SickLeaveOverlapError
from app.repositories.sick_leave_repository import SickLeaveRepository
from app.services.sick_leave_service import sick_leave_service

pytestmark = pytest.mark.asyncio(loop_scope="module")

repo = SickLeaveRepository()


async def _noop_audit_log(*args, **kwargs):
    return None


@pytest.fixture(autouse=True)
def _silence_audit(monkeypatch):
    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)


@pytest.fixture(autouse=True)
def _seed_admin(admin_user):
    # Автор записи (username "admin") должен существовать в БД: JIT больше не выполняется.
    return admin_user


def _payload(employee_id: int, start: date, end: date, comment: str = "test") -> dict:
    return {
        "employee_id": employee_id,
        "start_date": start,
        "end_date": end,
        "comment": comment,
    }


# -----------------------------------------------------------------------------
# create: соседние периоды разрешены
# -----------------------------------------------------------------------------


async def test_create_adjacent_sick_leaves_allowed(db_session, create_employee):
    employee = await create_employee(name="Adjacent")

    first = await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 5), date(2026, 5, 10)), "admin"
    )
    second = await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 10), date(2026, 5, 15)), "admin"
    )

    assert first["id"] > 0
    assert second["id"] > 0
    assert first["days_count"] == 6
    assert second["days_count"] == 6


async def test_create_single_day_on_boundary_allowed(db_session, create_employee):
    employee = await create_employee(name="Boundary single day")

    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 5), date(2026, 5, 10)), "admin"
    )
    single = await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 10), date(2026, 5, 10)), "admin"
    )

    assert single["id"] > 0
    assert single["days_count"] == 1


async def test_create_real_overlap_raises(db_session, create_employee):
    employee = await create_employee(name="Overlap")

    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 5), date(2026, 5, 10)), "admin"
    )

    with pytest.raises(SickLeaveOverlapError):
        await sick_leave_service.create_sick_leave(
            db_session, _payload(employee.id, date(2026, 5, 9), date(2026, 5, 12)), "admin"
        )


async def test_create_contained_overlap_raises(db_session, create_employee):
    employee = await create_employee(name="Contained")

    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 5), date(2026, 5, 20)), "admin"
    )

    with pytest.raises(SickLeaveOverlapError):
        await sick_leave_service.create_sick_leave(
            db_session, _payload(employee.id, date(2026, 5, 8), date(2026, 5, 10)), "admin"
        )


# -----------------------------------------------------------------------------
# update: тот же `check_overlap`, соседство допустимо, пересечение — ошибка
# -----------------------------------------------------------------------------


async def test_update_to_adjacent_allowed(db_session, create_employee):
    employee = await create_employee(name="Update adjacent")

    first = await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 5), date(2026, 5, 10)), "admin"
    )
    second = await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 11), date(2026, 5, 15)), "admin"
    )

    updated = await sick_leave_service.update_sick_leave(
        db_session, first["id"], {"end_date": date(2026, 5, 11)}, "admin"
    )

    assert updated["end_date"] == date(2026, 5, 11)
    assert updated["days_count"] == 7


async def test_update_into_overlap_raises(db_session, create_employee):
    employee = await create_employee(name="Update overlap")

    first = await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 5), date(2026, 5, 10)), "admin"
    )
    second = await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 11), date(2026, 5, 15)), "admin"
    )

    with pytest.raises(SickLeaveOverlapError):
        await sick_leave_service.update_sick_leave(
            db_session, second["id"], {"start_date": date(2026, 5, 9)}, "admin"
        )


# -----------------------------------------------------------------------------
# статистика: общий день засчитывается один раз
# -----------------------------------------------------------------------------


async def test_get_total_sick_days_deduplicates_boundary_day(db_session, create_employee):
    employee = await create_employee(name="Total days dedup")

    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 5), date(2026, 5, 10)), "admin"
    )
    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 10), date(2026, 5, 15)), "admin"
    )

    total = await repo.get_total_sick_days(db_session, employee.id, 2026)

    assert total == 11


async def test_get_total_sick_days_separate_periods_summed(db_session, create_employee):
    employee = await create_employee(name="Total days separate")

    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 5), date(2026, 5, 10)), "admin"
    )
    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 15), date(2026, 5, 20)), "admin"
    )

    total = await repo.get_total_sick_days(db_session, employee.id, 2026)

    assert total == 12


async def test_get_total_sick_days_dedups_regardless_of_insertion_order(
    db_session, create_employee
):
    """Склейка не зависит от порядка строк из БД (нет ORDER BY в выборке)."""
    employee = await create_employee(name="Total days order-independent")

    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 10), date(2026, 5, 15)), "admin"
    )
    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 5), date(2026, 5, 10)), "admin"
    )

    total = await repo.get_total_sick_days(db_session, employee.id, 2026)

    assert total == 11


async def test_employees_summary_deduplicates_boundary_day(db_session, create_employee):
    employee = await create_employee(name="Summary dedup")

    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 5), date(2026, 5, 10)), "admin"
    )
    await sick_leave_service.create_sick_leave(
        db_session, _payload(employee.id, date(2026, 5, 10), date(2026, 5, 15)), "admin"
    )

    summary = await repo.get_employees_summary(db_session, search_query=None, include_archived=False)

    row = next(x for x in summary if x["employee_id"] == employee.id)
    assert row["sick_leaves_count"] == 2
    assert row["total_sick_days"] == 11
