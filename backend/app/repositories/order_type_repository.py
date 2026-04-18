from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.order_type import OrderType


class OrderTypeRepository:
    async def list_all(
        self,
        db: AsyncSession,
        active_only: bool = False,
        show_in_orders_page: bool | None = None,
    ) -> list[OrderType]:
        query = select(OrderType).order_by(OrderType.name.asc())
        if active_only:
            query = query.where(OrderType.is_active == True)
        if show_in_orders_page is not None:
            query = query.where(OrderType.show_in_orders_page == show_in_orders_page)
        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_by_id(self, db: AsyncSession, order_type_id: int) -> Optional[OrderType]:
        result = await db.execute(select(OrderType).where(OrderType.id == order_type_id))
        return result.scalar_one_or_none()

    async def get_by_code(self, db: AsyncSession, code: str) -> Optional[OrderType]:
        result = await db.execute(select(OrderType).where(OrderType.code == code))
        return result.scalar_one_or_none()

    async def get_by_name(self, db: AsyncSession, name: str) -> Optional[OrderType]:
        result = await db.execute(select(OrderType).where(OrderType.name == name))
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, data: dict) -> OrderType:
        order_type = OrderType(**data)
        db.add(order_type)
        await db.flush()
        await db.refresh(order_type)
        return order_type

    async def update(self, db: AsyncSession, order_type: OrderType, data: dict) -> OrderType:
        for key, value in data.items():
            setattr(order_type, key, value)
        await db.flush()
        await db.refresh(order_type)
        return order_type

    async def delete(self, db: AsyncSession, order_type: OrderType) -> None:
        await db.delete(order_type)
        await db.flush()

    async def count_orders(self, db: AsyncSession, order_type_id: int) -> int:
        result = await db.execute(select(func.count(Order.id)).where(Order.order_type_id == order_type_id))
        return int(result.scalar() or 0)


order_type_repository = OrderTypeRepository()
