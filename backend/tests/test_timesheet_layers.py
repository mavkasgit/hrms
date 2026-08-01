"""Тесты трёхслойных ячеек табеля: авто / ручное / итог (тикет #20).

Проверяют доменное правило «итог = ручное, иначе авто» и то, что авто-слой
вычисляется на лету и не пишется в базу.

Также тестируют флаг order_changed (тикет #27): приказ изменился после ручной правки.
"""
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.main import app
from app.models.work_schedule import WorkSchedule, WorkScheduleEntry
from app.models.sick_leave import SickLeave
from app.services.sick_leave_service import sick_leave_service
from app.services.timesheet_service import timesheet_import_service
from app.services.work_schedule_service import work_schedule_service


pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession):
    """ASGI-клиент на изолированной тестовой сессии (как в test_users.py)."""

    async def override_get_db():
        try:
            yield db_session
        finally:
            await db_session.commit()

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


def _get_auth_headers():
    return {"Authorization": "Bearer admin"}


async def test_employee_on_vacation_without_edits(db_session, create_employee, create_vacation):
    emp = await create_employee(name="Vacation", hire_date=date(2024, 1, 1))
    await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 2),
        vacation_type="Трудовой",
    )

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 3, 30), date(2026, 4, 3)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    cells = row["cells"]

    # Каждый день периода присутствует в ответе — отсутствие слоя явное (None)
    assert set(cells) == {"2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03"}

    vacation_day = cells["2026-04-01"]
    assert vacation_day["auto"] == {
        "shift_type_code": "vacation",
        "source": "vacation",
        "order_id": None,
    }
    assert vacation_day["manual"] is None
    assert vacation_day["result"] == "vacation"
    assert vacation_day["conflict"] is False

    plain_day = cells["2026-03-30"]
    assert plain_day["auto"] is None
    assert plain_day["manual"] is None
    assert plain_day["result"] is None
    assert plain_day["conflict"] is False

    assert row["result_hours"] == 0.0


async def test_manual_shift_over_vacation_wins(db_session, create_employee, create_vacation):
    emp = await create_employee(name="Manual over Vacation", hire_date=date(2024, 1, 1))
    await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 5),
        vacation_type="Трудовой",
    )
    sched = await work_schedule_service.create_schedule(db_session, emp.id, 2026, 4, "tester")
    await work_schedule_service.set_entry(
        db_session, sched.id, date(2026, 4, 2), shift_type_code="day"
    )

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 5)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    cells = row["cells"]

    # Авто-слой не исчезает под ручным: отпуск остаётся виден
    overridden = cells["2026-04-02"]
    assert overridden["auto"]["shift_type_code"] == "vacation"
    assert overridden["auto"]["source"] == "vacation"
    assert overridden["manual"]["shift_type_code"] == "day"
    assert overridden["result"] == "day"
    assert overridden["conflict"] is False

    vacation_only = cells["2026-04-01"]
    assert vacation_only["auto"]["shift_type_code"] == "vacation"
    assert vacation_only["manual"] is None
    assert vacation_only["result"] == "vacation"

    # Часы по итогу: день (8ч) поверх отпуска считается по ручному значению
    assert row["result_hours"] == 8.0


async def test_vacation_sick_overlap_conflict(db_session, create_employee, create_vacation, monkeypatch):
    emp = await create_employee(name="Conflict", hire_date=date(2024, 1, 1))
    await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 5),
        vacation_type="Трудовой",
    )

    async def _noop_audit_log(*args, **kwargs):
        return None

    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)
    await sick_leave_service.create_sick_leave(
        db_session,
        {"employee_id": emp.id, "start_date": date(2026, 4, 3), "end_date": date(2026, 4, 7)},
        "admin",
    )

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 7)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    cells = row["cells"]

    conflict = cells["2026-04-04"]
    assert conflict["conflict"] is True
    assert conflict["auto"]["shift_type_code"] == "sick"
    assert conflict["auto"]["source"] == "sick_leave"
    assert conflict["result"] == "sick"

    # Оба значения отдаются: в списке отсутствий есть и отпуск, и больничный
    absence_types = {a["type"] for a in row["absences"]}
    assert absence_types == {"vacation", "sick_leave"}

    sick_only = cells["2026-04-07"]
    assert sick_only["conflict"] is False
    assert sick_only["auto"]["shift_type_code"] == "sick"
    assert sick_only["result"] == "sick"


async def test_unpaid_vacation_auto_code(db_session, create_employee, create_vacation):
    emp = await create_employee(name="Unpaid", hire_date=date(2024, 1, 1))
    await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 1),
        vacation_type="Отпуск за свой счет",
    )

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 1)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    cell = row["cells"]["2026-04-01"]
    assert cell["auto"]["shift_type_code"] == "A"
    assert cell["auto"]["source"] == "vacation"
    assert cell["result"] == "A"


async def test_response_validates_through_schema(db_session, create_employee, create_vacation):
    from app.schemas.timesheet import TimesheetResponse

    emp = await create_employee(name="Schema", hire_date=date(2024, 1, 1))
    await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 1),
        vacation_type="Трудовой",
    )

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 1)
    )
    # Схема — то же самое, что FastAPI прогоняет через response_model
    parsed = TimesheetResponse.model_validate(data)
    row = next(r for r in parsed.employees if r.id == emp.id)
    cell = row.cells["2026-04-01"]
    assert cell.result == "vacation"
    assert cell.auto is not None
    assert cell.auto.shift_type_code == "vacation"
    assert row.result_hours == 0.0


async def test_auto_layer_not_persisted(db_session, create_employee, create_vacation):
    emp = await create_employee(name="No Persist", hire_date=date(2024, 1, 1))
    await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 5),
        vacation_type="Трудовой",
    )

    async def _schedule_counts():
        sched_total = (await db_session.execute(select(func.count()).select_from(WorkSchedule))).scalar_one()
        entry_total = (await db_session.execute(select(func.count()).select_from(WorkScheduleEntry))).scalar_one()
        return sched_total, entry_total

    before = await _schedule_counts()
    first = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 5)
    )
    second = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 5)
    )
    after = await _schedule_counts()

    # Авто-слой не материализуется: новых записей графика не появилось
    assert before == after == (0, 0)
    # Повторное чтение того же периода без правок даёт тот же результат
    assert first == second


async def test_result_hours_by_period(db_session, create_employee, create_vacation):
    emp = await create_employee(name="Hours", hire_date=date(2024, 1, 1))
    await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 3),
        vacation_type="Трудовой",
    )
    sched = await work_schedule_service.create_schedule(db_session, emp.id, 2026, 4, "tester")
    await work_schedule_service.set_entry(db_session, sched.id, date(2026, 4, 4), shift_type_code="day")
    await work_schedule_service.set_entry(db_session, sched.id, date(2026, 4, 5), shift_type_code="day_long")

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 7)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)

    # Дни отпуска — 0ч, день (8ч) и 12-часовая смена по итогу
    assert row["result_hours"] == 8.0 + 12.0


async def test_result_hours_uses_manual_override(db_session, create_employee):
    emp = await create_employee(name="Override", hire_date=date(2024, 1, 1))
    sched = await work_schedule_service.create_schedule(db_session, emp.id, 2026, 4, "tester")
    await work_schedule_service.set_entry(
        db_session, sched.id, date(2026, 4, 1), shift_type_code="day", planned_hours_override=6.0
    )

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 1)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    assert row["cells"]["2026-04-01"]["result"] == "day"
    assert row["result_hours"] == 6.0


async def test_api_contract_returns_three_layers(
    async_client, create_employee, create_vacation
):
    """HTTP-контракт (как e2e api/timesheet.spec.ts) на новой форме ответа."""
    emp = await create_employee(name="API Contract", hire_date=date(2024, 1, 1))
    await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 2),
        vacation_type="Трудовой",
    )

    resp = await async_client.get(
        "/api/timesheet",
        params={"period_start": "2026-04-01", "period_end": "2026-04-02"},
        headers=_get_auth_headers(),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["period_start"] == "2026-04-01"
    assert data["period_end"] == "2026-04-02"
    assert isinstance(data["employees"], list)
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    cell = row["cells"]["2026-04-01"]
    assert cell["auto"]["shift_type_code"] == "vacation"
    assert cell["auto"]["source"] == "vacation"
    assert cell["manual"] is None
    assert cell["result"] == "vacation"
    assert cell["conflict"] is False
    assert "result_hours" in row

    resp = await async_client.get(
        "/api/timesheet/grid",
        params={"period_start": "2026-04-01", "period_end": "2026-04-02"},
        headers=_get_auth_headers(),
    )
    assert resp.status_code == 200
    grid = resp.json()
    assert isinstance(grid["shift_types"], list)
    assert isinstance(grid["holidays"], list)


# --- Тесты order_changed (тикет #27) ---


async def test_order_changed_true_when_order_after_manual_edit(
    db_session, create_employee, create_vacation
):
    """Приказ создан ПОСЛЕ ручной правки → order_changed = true."""
    emp = await create_employee(name="OrderAfter", hire_date=date(2024, 1, 1))

    # Ручная правка (запись графика)
    sched = await work_schedule_service.create_schedule(db_session, emp.id, 2026, 4, "tester")
    await work_schedule_service.set_entry(
        db_session, sched.id, date(2026, 4, 1), shift_type_code="day"
    )

    # Приказ (отпуск) создан позже — эмулируем через updated_at в будущем
    vacation = await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 3),
        vacation_type="Трудовой",
    )
    # Устанавливаем updated_at приказа позже записи графика
    entry = await db_session.get(WorkScheduleEntry, (await db_session.execute(
        select(WorkScheduleEntry).where(WorkScheduleEntry.schedule_id == sched.id)
    )).scalars().first().id)
    vacation.updated_at = entry.updated_at + timedelta(hours=1)
    await db_session.flush()

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 3)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    cell = row["cells"]["2026-04-01"]

    assert cell["order_changed"] is True
    assert cell["auto"]["source"] == "vacation"
    assert cell["manual"]["shift_type_code"] == "day"


async def test_order_changed_false_when_manual_edit_after_order(
    db_session, create_employee, create_vacation
):
    """Ручная правка ПОСЛЕ приказа → order_changed = false."""
    emp = await create_employee(name="EditAfter", hire_date=date(2024, 1, 1))

    # Приказ (отпуск) создан первым
    vacation = await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 3),
        vacation_type="Трудовой",
    )
    # Фиксируем время приказа
    order_time = datetime.now(timezone.utc)
    vacation.updated_at = order_time
    await db_session.flush()

    # Ручная правка позже
    sched = await work_schedule_service.create_schedule(db_session, emp.id, 2026, 4, "tester")
    await work_schedule_service.set_entry(
        db_session, sched.id, date(2026, 4, 1), shift_type_code="day"
    )

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 3)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    cell = row["cells"]["2026-04-01"]

    assert cell["order_changed"] is False


async def test_order_changed_false_when_entry_updated_at_null(
    db_session, create_employee, create_vacation
):
    """Запись с NULL updated_at (старые данные) → order_changed = false."""
    emp = await create_employee(name="NullTs", hire_date=date(2024, 1, 1))

    # Приказ
    await create_vacation(
        employee=emp,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 3),
        vacation_type="Трудовой",
    )

    # Ручная запись с NULL updated_at (эмулируем старые данные)
    sched = await work_schedule_service.create_schedule(db_session, emp.id, 2026, 4, "tester")
    entry = await work_schedule_service.set_entry(
        db_session, sched.id, date(2026, 4, 1), shift_type_code="day"
    )
    # Обнуляем updated_at чтобы эмулировать старые данные
    entry.updated_at = None
    await db_session.flush()

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 3)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    cell = row["cells"]["2026-04-01"]

    assert cell["order_changed"] is False


async def test_order_changed_false_without_auto_layer(
    db_session, create_employee
):
    """Нет приказа (авто-слой) → order_changed = false даже при наличии записи."""
    emp = await create_employee(name="NoAuto", hire_date=date(2024, 1, 1))

    sched = await work_schedule_service.create_schedule(db_session, emp.id, 2026, 4, "tester")
    await work_schedule_service.set_entry(
        db_session, sched.id, date(2026, 4, 1), shift_type_code="day"
    )

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 1)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    cell = row["cells"]["2026-04-01"]

    assert cell["order_changed"] is False
    assert cell["auto"] is None
    assert cell["manual"]["shift_type_code"] == "day"


async def test_order_changed_with_sick_leave(
    db_session, create_employee, monkeypatch
):
    """Больничный, созданный после ручной правки → order_changed = true."""
    emp = await create_employee(name="SickAfter", hire_date=date(2024, 1, 1))

    # Ручная правка
    sched = await work_schedule_service.create_schedule(db_session, emp.id, 2026, 4, "tester")
    await work_schedule_service.set_entry(
        db_session, sched.id, date(2026, 4, 1), shift_type_code="day"
    )

    # Больничный создан позже
    async def _noop_audit_log(*args, **kwargs):
        return None

    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)
    await sick_leave_service.create_sick_leave(
        db_session,
        {"employee_id": emp.id, "start_date": date(2026, 4, 1), "end_date": date(2026, 4, 3)},
        "admin",
    )
    # Устанавливаем updated_at больничного позже записи графика
    entry = (await db_session.execute(
        select(WorkScheduleEntry).where(WorkScheduleEntry.schedule_id == sched.id)
    )).scalars().first()
    sick = (await db_session.execute(
        select(SickLeave).where(SickLeave.employee_id == emp.id)
    )).scalars().first()
    sick.updated_at = entry.updated_at + timedelta(hours=1)
    await db_session.flush()

    data = await timesheet_import_service.get_timesheet(
        db_session, date(2026, 4, 1), date(2026, 4, 3)
    )
    row = next(r for r in data["employees"] if r["id"] == emp.id)
    cell = row["cells"]["2026-04-01"]

    assert cell["order_changed"] is True
    assert cell["auto"]["source"] == "sick_leave"
