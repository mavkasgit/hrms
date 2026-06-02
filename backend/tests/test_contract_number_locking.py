from datetime import date

import pytest

from app.services.order_service import order_service
from app.services.contract_history_service import contract_history_service
from app.schemas.order import OrderCreate
from app.api.employees import _get_contract_number_locked

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_contract_number_not_locked_without_orders(db_session, create_employee):
    """Номер контракта НЕ заблокирован если нет приказов с номером контракта."""
    employee = await create_employee(name="Ivanov Ivan", contract_number="K-100")

    locked = await _get_contract_number_locked(db_session, employee.id)
    assert locked is False


async def test_contract_number_locked_after_hire_order(db_session, create_employee, monkeypatch):
    """Номер контракта заблокирован после приказа о приёме с номером."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Petrov Petr", contract_number="K-200")
    hire_type = await order_service.get_order_type_by_code(db_session, "hire")

    async def _fake_generate(*args, **kwargs):
        return "/fake/path.docx", "doc.docx"

    monkeypatch.setattr("app.services.order_service.generate_document", _fake_generate)

    await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=hire_type.id,
            order_date=date(2025, 1, 15),
            extra_fields={
                "new_contract_number": "K-200",
                "hire_date": "2025-01-15",
                "contract_end": "2026-01-15",
            },
        ),
    )

    locked = await _get_contract_number_locked(db_session, employee.id)
    assert locked is True


async def test_contract_number_not_locked_after_extension_order_without_number(db_session, create_employee, monkeypatch):
    """Продление контракта без contract_number у сотрудника НЕ блокирует номер."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(
        name="Sidorov Alex",
        contract_number=None,  # Нет номера у сотрудника
        contract_start=date(2024, 1, 1),
        contract_end=date(2025, 12, 31),
    )
    extension_type = await order_service.get_order_type_by_code(db_session, "contract_extension")

    async def _fake_generate(*args, **kwargs):
        return "/fake/path.docx", "doc.docx"

    monkeypatch.setattr("app.services.order_service.generate_document", _fake_generate)

    await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=extension_type.id,
            order_date=date(2025, 6, 1),
            extra_fields={
                "new_contract_end": "2027-12-31",
            },
        ),
    )

    # Extension создал запись в ContractHistory но contract_number = None
    locked = await _get_contract_number_locked(db_session, employee.id)
    assert locked is False


async def test_contract_number_update_blocked_when_locked(db_session, create_employee, monkeypatch):
    """Нельзя изменить contract_number через форму сотрудника если он заблокирован."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Kozlov Dmitri", contract_number="K-400")
    hire_type = await order_service.get_order_type_by_code(db_session, "hire")

    async def _fake_generate(*args, **kwargs):
        return "/fake/path.docx", "doc.docx"

    monkeypatch.setattr("app.services.order_service.generate_document", _fake_generate)

    await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=hire_type.id,
            order_date=date(2025, 3, 1),
            extra_fields={
                "new_contract_number": "K-400",
                "hire_date": "2025-03-01",
                "contract_end": "2026-03-01",
            },
        ),
    )

    from app.services.employee_service import employee_service
    from app.schemas.employee import EmployeeUpdate

    with pytest.raises(ValueError, match="Номер контракта заблокирован"):
        await employee_service.update_employee(
            db_session,
            employee.id,
            EmployeeUpdate(contract_number="K-999"),
            "admin",
        )


async def test_contract_number_update_allowed_when_not_locked(db_session, create_employee):
    """Можно изменить contract_number через форму сотрудника если нет приказа с номером."""
    employee = await create_employee(name="Morozova Anna", contract_number="K-500")

    from app.services.employee_service import employee_service
    from app.schemas.employee import EmployeeUpdate

    updated, _ = await employee_service.update_employee(
        db_session,
        employee.id,
        EmployeeUpdate(contract_number="K-501"),
        "admin",
    )

    assert updated.contract_number == "K-501"


async def test_contract_number_unlocked_after_order_delete(db_session, create_employee, create_order_type, create_order):
    """После удаления приказа с номером контракта — номер снова доступен для редактирования."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Volkov Sergey", contract_number="K-600")
    hire_type = await order_service.get_order_type_by_code(db_session, "hire")

    order = await create_order(
        employee=employee,
        order_type_obj=hire_type,
        order_number="10-к",
        order_date=date(2025, 4, 1),
        extra_fields={"new_contract_number": "K-600"},
    )

    # Создаём запись в ContractHistory вручную (как это делает order_service)
    await contract_history_service.record_contract_from_order(
        db_session, employee.id, order.id, "hire",
        {"new_contract_number": "K-600"}, employee,
    )

    locked = await _get_contract_number_locked(db_session, employee.id)
    assert locked is True

    # Удаляем приказ
    await order_service.hard_delete_order(db_session, order.id)

    locked = await _get_contract_number_locked(db_session, employee.id)
    assert locked is False

    # Теперь можно менять номер
    from app.services.employee_service import employee_service
    from app.schemas.employee import EmployeeUpdate

    updated, _ = await employee_service.update_employee(
        db_session,
        employee.id,
        EmployeeUpdate(contract_number="K-601"),
        "admin",
    )
    assert updated.contract_number == "K-601"
