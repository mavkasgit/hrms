from datetime import date

import pytest

from app.repositories.order_type_repository import OrderTypeRepository
from app.services.order_service import order_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_ensure_default_order_types_includes_weekend_call(db_session):
    await order_service.ensure_default_order_types(db_session)

    repo = OrderTypeRepository()
    weekend_call = await repo.get_by_code(db_session, "weekend_call")

    assert weekend_call is not None
    assert weekend_call.name == "Вызов в выходной"
    assert weekend_call.show_in_orders_page is False
    assert weekend_call.template_filename == "prikaz_vyzov_v_vyhodnoy.docx"
    assert weekend_call.field_schema == [
        {"key": "call_date", "label": "Дата вызова", "type": "date", "required": False},
        {"key": "call_date_start", "label": "Дата начала", "type": "date", "required": False},
        {"key": "call_date_end", "label": "Дата окончания", "type": "date", "required": False},
    ]


async def test_get_all_filters_by_order_type_code(db_session, create_employee, create_order):
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Employee Weekend")
    weekend_call_type = await order_service.get_order_type_by_code(db_session, "weekend_call")
    vacation_unpaid_type = await order_service.get_order_type_by_code(db_session, "vacation_unpaid")

    await create_order(
        employee=employee,
        order_type_obj=weekend_call_type,
        order_number="91",
        order_date=date(2026, 4, 10),
    )
    await create_order(
        employee=employee,
        order_type_obj=vacation_unpaid_type,
        order_number="92",
        order_date=date(2026, 4, 11),
    )
    await db_session.flush()

    result = await order_service.get_all(db_session, page=1, per_page=50, order_type_code="weekend_call")

    assert result["total"] == 1
    assert len(result["items"]) == 1
    assert result["items"][0]["order_type_code"] == "weekend_call"


async def test_weekend_call_extra_fields_are_preserved(db_session, create_employee, create_order):
    await order_service.ensure_default_order_types(db_session)

    employee = await create_employee(name="Employee Extra Fields")
    weekend_call_type = await order_service.get_order_type_by_code(db_session, "weekend_call")

    await create_order(
        employee=employee,
        order_type_obj=weekend_call_type,
        order_number="93",
        order_date=date(2026, 4, 12),
        extra_fields={
            "call_date": "2026-04-19",
            "call_date_start": "2026-04-19",
            "call_date_end": "2026-04-20",
        },
    )
    await db_session.flush()

    result = await order_service.get_all(db_session, page=1, per_page=50, order_type_code="weekend_call")

    assert result["total"] >= 1
    item = next(row for row in result["items"] if row["order_number"] == "93")
    assert item["extra_fields"]["call_date"] == "2026-04-19"
    assert item["extra_fields"]["call_date_start"] == "2026-04-19"
    assert item["extra_fields"]["call_date_end"] == "2026-04-20"
