from datetime import date

import pytest

from app.services.order_service import order_service
from app.schemas.order import OrderCreate

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_dismissal_order_archives_employee(db_session, create_employee):
    """При создании приказа об увольнении сотрудник автоматически архивируется."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Ivanov Ivan")
    assert employee.is_dismissed is False
    assert employee.dismissal_date is None

    dismissal_type = await order_service.get_order_type_by_code(db_session, "dismissal")

    order = await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=dismissal_type.id,
            order_date=date(2026, 5, 6),
            extra_fields={"dismissal_date": "2026-05-06"},
        ),
    )

    # Проверяем что сотрудник заархивирован
    from app.repositories.employee_repository import EmployeeRepository
    repo = EmployeeRepository()
    archived_employee = await repo.get_by_id(db_session, employee.id)

    assert archived_employee.is_dismissed is True
    assert archived_employee.dismissal_date == date(2026, 5, 6)
    assert "Приказ" in archived_employee.dismissal_reason
    assert order is not None


async def test_delete_dismissal_order_restores_employee(db_session, create_employee, create_order_type, create_order):
    """При удалении приказа об увольнении сотрудник восстанавливается."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Sidorov Alex")
    dismissal_type = await order_service.get_order_type_by_code(db_session, "dismissal")

    from app.repositories.employee_repository import EmployeeRepository
    repo = EmployeeRepository()
    employee.is_dismissed = True
    employee.dismissal_date = date(2026, 5, 6)
    employee.dismissal_reason = "Test"
    await db_session.flush()

    order = await create_order(
        employee=employee,
        order_type_obj=dismissal_type,
        order_number="2-к",
        order_date=date(2026, 5, 6),
    )
    order_id = order.id

    # Удаляем приказ
    await order_service.hard_delete_order(db_session, order_id)

    restored_employee = await repo.get_by_id(db_session, employee.id)
    assert restored_employee.is_dismissed is False
    assert restored_employee.dismissal_date is None
    assert restored_employee.dismissal_reason is None


async def test_non_dismissal_order_does_not_archive_employee(db_session, create_employee, create_order_type, create_order):
    """Приказы НЕ об увольнении не архивируют сотрудника."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Test Employee")
    hire_type = await order_service.get_order_type_by_code(db_session, "hire")

    await create_order(
        employee=employee,
        order_type_obj=hire_type,
        order_number="3-к",
        order_date=date(2026, 5, 6),
    )

    from app.repositories.employee_repository import EmployeeRepository
    repo = EmployeeRepository()
    fetched_employee = await repo.get_by_id(db_session, employee.id)

    assert fetched_employee.is_dismissed is False
    assert fetched_employee.dismissal_date is None
