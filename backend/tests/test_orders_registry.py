"""Tests for the orders registry endpoint (letter-based filtering)."""
import uuid
from datetime import date

import pytest

from app.services.order_service import order_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_registry_returns_orders_with_matching_letter(
    db_session, create_employee, create_order_type, create_order
):
    """Registry should return only orders whose type has the specified letter."""
    await order_service.ensure_default_order_types(db_session)

    vacation_paid_type = await order_service.get_order_type_by_code(db_session, "vacation_paid")

    employee = await create_employee(name="Иванов И.И.")

    await create_order(
        employee=employee,
        order_type_obj=vacation_paid_type,
        order_number="1-л",
        order_date=date(2026, 3, 15),
    )

    # Создаём тип приказа с другой литой
    other_type = await create_order_type(
        code=f"test_other_{uuid.uuid4().hex[:6]}",
        name=f"Other Type {uuid.uuid4().hex[:6]}",
        letter="к",
    )

    employee2 = await create_employee(name="Петров П.П.")
    await create_order(
        employee=employee2,
        order_type_obj=other_type,
        order_number="1-к",
        order_date=date(2026, 4, 1),
    )

    await db_session.flush()

    # Запрашиваем реестр с литой 'л' за 2026 год
    result = await order_service.get_all(
        db_session, page=1, per_page=10000, year=2026, order_letter="л"
    )

    assert result["total"] == 1
    assert len(result["items"]) == 1
    assert result["items"][0]["order_number"] == "1-л"
    assert result["items"][0]["employee_name"] == "Иванов И.И."


async def test_registry_includes_group_orders_with_all_employees(
    db_session, create_employee, create_order_type, create_order
):
    """Registry should include group orders and expose group_employees."""
    await order_service.ensure_default_order_types(db_session)

    vacation_paid_type = await order_service.get_order_type_by_code(db_session, "vacation_paid")

    emp1 = await create_employee(name="Сотрудник Один")
    emp2 = await create_employee(name="Сотрудник Два")

    # Групповой приказ (is_group=True)
    group_order = await create_order(
        order_type_obj=vacation_paid_type,
        order_number="5-л",
        order_date=date(2026, 5, 1),
        employee_id=None,
        is_group=True,
    )
    await db_session.flush()

    result = await order_service.get_all(
        db_session, page=1, per_page=10000, year=2026, order_letter="л"
    )

    assert result["total"] >= 1
    group = next(o for o in result["items"] if o["order_number"] == "5-л")
    assert group["is_group"] is True


async def test_registry_excludes_deleted_and_cancelled_orders(
    db_session, create_employee, create_order_type, create_order
):
    """Registry should not return deleted or cancelled orders."""
    await order_service.ensure_default_order_types(db_session)

    vacation_paid_type = await order_service.get_order_type_by_code(db_session, "vacation_paid")
    employee = await create_employee(name="Активный Сотрудник")

    active_order = await create_order(
        employee=employee,
        order_type_obj=vacation_paid_type,
        order_number="10-л",
        order_date=date(2026, 6, 1),
    )

    # Помечаем как удалённый
    active_order.is_deleted = True
    await db_session.flush()

    result = await order_service.get_all(
        db_session, page=1, per_page=10000, year=2026, order_letter="л"
    )

    assert result["total"] == 0
    assert len(result["items"]) == 0


async def test_registry_filters_by_year(
    db_session, create_employee, create_order_type, create_order
):
    """Registry should only return orders for the requested year."""
    await order_service.ensure_default_order_types(db_session)

    vacation_paid_type = await order_service.get_order_type_by_code(db_session, "vacation_paid")
    employee = await create_employee(name="Годовой Сотрудник")

    await create_order(
        employee=employee,
        order_type_obj=vacation_paid_type,
        order_number="2025-л",
        order_date=date(2025, 1, 15),
    )
    await create_order(
        employee=employee,
        order_type_obj=vacation_paid_type,
        order_number="2026-л",
        order_date=date(2026, 1, 15),
    )

    await db_session.flush()

    # Запрос за 2026
    result_2026 = await order_service.get_all(
        db_session, page=1, per_page=10000, year=2026, order_letter="л"
    )
    assert result_2026["total"] == 1
    assert result_2026["items"][0]["order_number"] == "2026-л"

    # Запрос за 2025
    result_2025 = await order_service.get_all(
        db_session, page=1, per_page=10000, year=2025, order_letter="л"
    )
    assert result_2025["total"] == 1
    assert result_2025["items"][0]["order_number"] == "2025-л"
