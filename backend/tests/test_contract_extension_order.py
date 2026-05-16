from datetime import date

import pytest

from app.services.order_service import order_service
from app.schemas.order import OrderCreate

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_contract_extension_updates_contract_end(db_session, create_employee):
    """При создании приказа о продлении контракта обновляется employee.contract_end."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Ivanov Ivan", contract_end=date(2025, 12, 31))
    assert employee.contract_end == date(2025, 12, 31)

    extension_type = await order_service.get_order_type_by_code(db_session, "contract_extension")

    order = await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=extension_type.id,
            order_date=date(2025, 12, 1),
            extra_fields={"contract_new_end": "2026-12-31"},
        ),
    )

    from app.repositories.employee_repository import EmployeeRepository
    repo = EmployeeRepository()
    updated_employee = await repo.get_by_id(db_session, employee.id)

    assert updated_employee.contract_end == date(2026, 12, 31)
    assert order.extra_fields.get("old_contract_end") == "2025-12-31"


async def test_contract_extension_without_new_end(db_session, create_employee):
    """Приказ о продлении без contract_new_end НЕ меняет contract_end."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Petrov Petr", contract_end=date(2025, 6, 30))

    extension_type = await order_service.get_order_type_by_code(db_session, "contract_extension")

    await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=extension_type.id,
            order_date=date(2025, 6, 1),
            extra_fields={"trial_end": "2025-09-01"},
        ),
    )

    from app.repositories.employee_repository import EmployeeRepository
    repo = EmployeeRepository()
    updated_employee = await repo.get_by_id(db_session, employee.id)

    assert updated_employee.contract_end == date(2025, 6, 30)


async def test_contract_extension_sequential(db_session, create_employee):
    """Два приказа о продлении подряд: каждый сохраняет свою old_contract_end."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Sidorov Alex", contract_end=date(2025, 12, 31))

    extension_type = await order_service.get_order_type_by_code(db_session, "contract_extension")

    # Первое продление
    order1 = await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=extension_type.id,
            order_date=date(2025, 12, 1),
            extra_fields={"contract_new_end": "2026-12-31"},
        ),
    )

    from app.repositories.employee_repository import EmployeeRepository
    repo = EmployeeRepository()
    updated_employee = await repo.get_by_id(db_session, employee.id)
    assert updated_employee.contract_end == date(2026, 12, 31)
    assert order1.extra_fields.get("old_contract_end") == "2025-12-31"

    # Второе продление
    order2 = await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=extension_type.id,
            order_date=date(2026, 5, 1),
            extra_fields={"contract_new_end": "2027-12-31"},
        ),
    )

    updated_employee = await repo.get_by_id(db_session, employee.id)
    assert updated_employee.contract_end == date(2027, 12, 31)
    assert order2.extra_fields.get("old_contract_end") == "2026-12-31"


async def test_delete_contract_extension_restores_contract_end(db_session, create_employee, create_order_type, create_order):
    """При удалении приказа о продлении восстанавливается предыдущая contract_end."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Morozov Petr", contract_end=date(2025, 12, 31))
    extension_type = await order_service.get_order_type_by_code(db_session, "contract_extension")

    order = await create_order(
        employee=employee,
        order_type_obj=extension_type,
        order_number="6-к",
        order_date=date(2025, 12, 1),
        extra_fields={"contract_new_end": "2026-12-31", "old_contract_end": "2025-12-31"},
    )
    order_id = order.id

    # Обновляем contract_end вручную (как если бы приказ был создан через сервис)
    from app.repositories.employee_repository import EmployeeRepository
    repo = EmployeeRepository()
    employee.contract_end = date(2026, 12, 31)
    await db_session.flush()

    # Удаляем приказ
    await order_service.hard_delete_order(db_session, order_id)

    restored_employee = await repo.get_by_id(db_session, employee.id)
    assert restored_employee.contract_end == date(2025, 12, 31)
