from datetime import date

import pytest
from sqlalchemy import select

from app.models.contract_history import ContractHistory
from app.models.employee import Employee
from app.models.order import Order
from app.schemas.order import OrderCreate
from app.services.order_service import order_service


pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_transfer_order_records_position_history(
    db_session,
    create_employee,
    create_order_type,
    create_position,
):
    """Test that creating a transfer order records old and new positions in contract history."""
    # Create old and new positions
    old_position = await create_position(name="Укладчик-упаковщик")
    new_position = await create_position(name="Загрузчик-выгрузчик")

    # Create employee with old position
    employee = await create_employee(
        name="Шиша Матвей Александрович",
        tab_number=446,
        position=old_position,
        hire_date=date(2024, 1, 15),
    )

    # Create transfer order type
    transfer_type = await create_order_type(
        code="transfer",
        name="Перевод",
        is_active=True,
        field_schema=[
            {"key": "new_position", "label": "Новая должность", "type": "select", "required": False, "enabled": True, "entity": "position"},
            {"key": "new_contract_start", "label": "Начало", "type": "date", "required": False, "enabled": True},
            {"key": "new_contract_end", "label": "Конец", "type": "date", "required": False, "enabled": True},
            {"key": "new_contract_number", "label": "Номер", "type": "text", "required": False, "enabled": True},
            {"key": "new_contract_years", "label": "Срок (лет)", "type": "number", "required": False, "enabled": True},
        ],
    )

    # Create transfer order
    order = await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=transfer_type.id,
            order_date=date(2026, 6, 2),
            order_number="9-к",
            extra_fields={
                "new_position": new_position.id,
                "new_position_name": new_position.name,
                "new_contract_start": "2026-08-01",
                "new_contract_end": "2028-07-31",
                "new_contract_number": "987",
                "new_contract_years": 2,
            },
        ),
    )

    # Verify contract history was created with position data
    result = await db_session.execute(
        select(ContractHistory)
        .where(ContractHistory.employee_id == employee.id)
        .where(ContractHistory.order_id == order.id)
    )
    history = result.scalar_one_or_none()

    assert history is not None
    assert history.old_position == "Укладчик-упаковщик"
    assert history.new_position == "Загрузчик-выгрузчик"
    assert history.order_type_code == "transfer"
    assert history.contract_number == "987"
    assert history.contract_start == date(2026, 8, 1)
    assert history.contract_end == date(2028, 7, 31)

    # Verify employee position was updated
    await db_session.refresh(employee)
    assert employee.position_id == new_position.id


async def test_transfer_order_without_new_position_name_still_records(
    db_session,
    create_employee,
    create_order_type,
    create_position,
):
    """Test that transfer order without new_position_name still creates history record."""
    old_position = await create_position(name="Вахтёр")
    new_position = await create_position(name="Грузчик")

    employee = await create_employee(
        name="Тестовый Сотрудник",
        tab_number=500,
        position=old_position,
        hire_date=date(2024, 1, 15),
    )

    transfer_type = await create_order_type(
        code="transfer",
        name="Перевод",
        is_active=True,
        field_schema=[],
    )

    order = await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=transfer_type.id,
            order_date=date(2026, 6, 2),
            order_number="10-к",
            extra_fields={
                "new_position": new_position.id,
                "new_contract_start": "2026-08-01",
            },
        ),
    )

    result = await db_session.execute(
        select(ContractHistory)
        .where(ContractHistory.employee_id == employee.id)
        .where(ContractHistory.order_id == order.id)
    )
    history = result.scalar_one_or_none()

    assert history is not None
    assert history.old_position == "Вахтёр"
    # new_position is resolved automatically to name from DB even if only ID is provided
    assert history.new_position == "Грузчик"
