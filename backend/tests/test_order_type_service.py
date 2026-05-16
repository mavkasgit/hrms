import pytest

from app.repositories.order_type_repository import OrderTypeRepository
from app.services.order_type_service import OrderTypeService

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_ensure_default_order_types_heals_name_conflict(db_session, create_order_type):
    legacy = await create_order_type(
        code="dismissal_legacy",
        name="Увольнение",
        is_active=True,
        show_in_orders_page=True,
    )

    service = OrderTypeService()
    await service.ensure_default_order_types(db_session)

    repo = OrderTypeRepository()
    dismissal = await repo.get_by_code(db_session, "dismissal")
    legacy_after = await repo.get_by_code(db_session, "dismissal_legacy")

    assert dismissal is not None
    assert dismissal.id == legacy.id
    assert dismissal.name == "Увольнение"
    assert legacy_after is None

