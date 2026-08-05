from datetime import date

import pytest
from sqlalchemy import select

from app.core.exceptions import HRMSException
from app.models.contract_history import ContractHistory
from app.schemas.order import OrderCreate
from app.services.order_service import order_service
from app.repositories.employee_repository import EmployeeRepository

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _fake_generate(*args, **kwargs):
    return "/fake/path.docx", "doc.docx"


async def test_hire_ignores_new_contract_start(db_session, create_employee, monkeypatch):
    """hire-приказ игнорирует new_contract_start (автозаполнение: конец+1 день)
    и использует contract_start/hire_date — и в контракте сотрудника, и в history."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(
        name="Petrov Petr",
        contract_start=date(2025, 1, 1),
        contract_end=date(2026, 7, 8),
    )
    hire_type = await order_service.get_order_type_by_code(db_session, "hire")

    monkeypatch.setattr("app.services.order_service.generate_document", _fake_generate)

    order = await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=hire_type.id,
            order_date=date(2026, 7, 8),
            extra_fields={
                "hire_date": "2026-07-08",
                "contract_start": "2026-07-08",
                "contract_end": "2027-07-07",
                # Испорченное автозаполнением значение (конец старого контракта + 1 день)
                # должно игнорироваться для hire.
                "new_contract_start": "2027-07-09",
                "new_contract_number": "K-BAD",
            },
        ),
    )

    repo = EmployeeRepository()
    updated = await repo.get_by_id(db_session, employee.id)
    assert updated is not None
    assert updated.contract_start == date(2026, 7, 8)
    assert updated.contract_end == date(2027, 7, 7)

    result = await db_session.execute(
        select(ContractHistory).where(ContractHistory.order_id == order.id)
    )
    history = result.scalar_one_or_none()
    assert history is not None
    assert history.contract_start == date(2026, 7, 8)
    assert history.contract_end == date(2027, 7, 7)


async def test_new_contract_uses_new_contract_fields(db_session, create_employee, monkeypatch):
    """new_contract продолжает резолвить даты через new_contract_*."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Ivanov Ivan", contract_end=date(2026, 7, 8))
    new_contract_type = await order_service.get_order_type_by_code(db_session, "new_contract")

    monkeypatch.setattr("app.services.order_service.generate_document", _fake_generate)

    await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=employee.id,
            order_type_id=new_contract_type.id,
            order_date=date(2026, 7, 8),
            extra_fields={
                "new_contract_start": "2027-08-01",
                "new_contract_end": "2029-07-31",
                "new_contract_number": "K-700",
                "hire_date": "2026-07-08",
            },
        ),
    )

    repo = EmployeeRepository()
    updated = await repo.get_by_id(db_session, employee.id)
    assert updated is not None
    assert updated.contract_start == date(2027, 8, 1)
    assert updated.contract_end == date(2029, 7, 31)
    assert updated.contract_number == "K-700"


async def test_hire_order_raises_when_contract_end_in_past(db_session, create_employee, monkeypatch):
    """Если contract_end приказа раньше текущего — создание приказа прерывается с 409."""
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Sidorov Alex", contract_end=date(2028, 12, 31))
    hire_type = await order_service.get_order_type_by_code(db_session, "hire")

    monkeypatch.setattr("app.services.order_service.generate_document", _fake_generate)

    with pytest.raises(HRMSException) as excinfo:
        await order_service.create_order(
            db_session,
            OrderCreate(
                employee_id=employee.id,
                order_type_id=hire_type.id,
                order_date=date(2026, 7, 8),
                extra_fields={
                    "hire_date": "2026-07-08",
                    "contract_end": "2027-07-07",
                },
            ),
        )
    assert excinfo.value.status_code == 409
    assert "Контракт сотрудника не обновлён" in str(excinfo.value)
