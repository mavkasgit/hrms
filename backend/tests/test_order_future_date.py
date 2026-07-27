"""Приказ с будущей датой создаётся без ошибки (мягкое предупреждение — на фронте)."""

from datetime import date, timedelta

import pytest

from app.schemas.order import OrderCreate
from app.services import order_service as order_service_module
from app.services.order_service import order_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _fake_generate_document(order_number, data, employee, order_type, year_dir):
    filename = f"{order_type.code}_{order_number}.docx"
    return str(year_dir / filename), filename


async def test_order_create_schema_accepts_future_date():
    future = date.today() + timedelta(days=30)
    order = OrderCreate(
        employee_id=None,
        order_type_id=1,
        order_date=future,
        order_number="FUT-1",
    )
    assert order.order_date == future


async def test_order_with_future_date_can_be_created(db_session, monkeypatch):
    monkeypatch.setattr(order_service_module, "generate_document", _fake_generate_document)
    await order_service.ensure_default_order_types(db_session)

    general_order_type = await order_service.get_order_type_by_code(db_session, "general_order")
    future = date.today() + timedelta(days=30)

    order = await order_service.create_order(
        db_session,
        OrderCreate(
            employee_id=None,
            order_type_id=general_order_type.id,
            order_date=future,
            order_number="FUT-2",
        ),
    )

    assert order.id is not None
    assert order.order_date == future
