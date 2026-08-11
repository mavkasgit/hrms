from datetime import date

import pytest

from app.schemas.employee import EmployeeUpdate
from app.services.employee_service import employee_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_update_employee_allows_editing_other_fields_with_bad_contract_dates(
    db_session, create_employee
):
    """Обновление любого поля не блокируется «нелогичными» датами контракта
    (конец раньше начала) — валидация дат контракта убрана."""
    employee = await create_employee(
        name="Ivanov Ivan",
        contract_start=date(2025, 1, 1),
        contract_end=date(2024, 1, 1),
    )

    updated, periods_need_reset = await employee_service.update_employee(
        db_session, employee.id, EmployeeUpdate(name="Petrov Petr"), "tester"
    )

    assert updated.name == "Petrov Petr"
    assert periods_need_reset is False
    assert updated.contract_start == date(2025, 1, 1)
    assert updated.contract_end == date(2024, 1, 1)


async def test_update_employee_allows_setting_any_contract_dates(db_session, create_employee):
    """Даты контракта можно выставить в любом порядке — валидация не вмешивается."""
    employee = await create_employee(name="Sidorov Alex")

    updated, _ = await employee_service.update_employee(
        db_session,
        employee.id,
        EmployeeUpdate(
            contract_start=date(2026, 6, 1),
            contract_end=date(2026, 1, 1),
        ),
        "tester",
    )

    assert updated.contract_start == date(2026, 6, 1)
    assert updated.contract_end == date(2026, 1, 1)
