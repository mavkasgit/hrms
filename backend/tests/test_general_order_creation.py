from datetime import date

import pytest

from app.core.exceptions import HRMSException
from app.schemas.order import OrderCreate
from app.services import order_service as order_service_module
from app.services.order_service import order_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _fake_generate_document(order_number, data, employee, order_type, year_dir):
    filename = f"{order_type.code}_{order_number}.docx"
    return str(year_dir / filename), filename


async def test_general_order_can_be_created_without_employee(db_session, monkeypatch):
    monkeypatch.setattr(order_service_module, "generate_document", _fake_generate_document)
    await order_service.ensure_default_order_types(db_session)

    general_order_type = await order_service.get_order_type_by_code(db_session, "general_order")
    order = await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=None,
            order_type_id=general_order_type.id,
            order_date=date(2026, 5, 16),
            order_number="GO-1",
        ),
    )

    assert order.id is not None
    assert order.employee_id is None


async def test_non_general_order_requires_employee(db_session, monkeypatch):
    monkeypatch.setattr(order_service_module, "generate_document", _fake_generate_document)
    await order_service.ensure_default_order_types(db_session)

    hire_order_type = await order_service.get_order_type_by_code(db_session, "hire")

    with pytest.raises(HRMSException) as exc:
        await order_service.create_order(
            db_session,
            OrderCreate(
                employee_id=None,
                order_type_id=hire_order_type.id,
                order_date=date(2026, 5, 16),
                order_number="H-1",
            ),
        )

    assert exc.value.error_code == "employee_required"
    assert exc.value.status_code == 422
