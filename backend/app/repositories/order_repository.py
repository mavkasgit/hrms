from datetime import datetime
from typing import Optional

from sqlalchemy import and_, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order


class OrderRepository:
    async def get_all(
        self,
        db: AsyncSession,
        page: int = 1,
        per_page: int = 20,
        sort_by: Optional[str] = None,
        sort_order: str = "desc",
        year: Optional[int] = None,
    ) -> tuple[list[Order], int]:
        conditions = [Order.is_deleted == False, Order.is_cancelled == False]

        if year:
            conditions.append(extract("year", Order.order_date) == year)

        where_clause = and_(*conditions) if conditions else True

        count_query = select(func.count(Order.id)).where(where_clause)
        total_result = await db.execute(count_query)
        total = total_result.scalar()

        sort_column = getattr(Order, sort_by, Order.created_date) if sort_by else Order.created_date
        order_expr = sort_column.asc() if sort_order == "asc" else sort_column.desc()

        data_query = (
            select(Order)
            .options(selectinload(Order.employee), selectinload(Order.order_type))
            .where(where_clause)
            .order_by(order_expr)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        result = await db.execute(data_query)
        items = list(result.scalars().all())

        return items, total

    async def get_recent(
        self,
        db: AsyncSession,
        limit: int = 10,
        year: Optional[int] = None,
    ) -> list[Order]:
        conditions = [Order.is_deleted == False, Order.is_cancelled == False]

        if year:
            conditions.append(extract("year", Order.order_date) == year)

        where_clause = and_(*conditions) if conditions else True

        result = await db.execute(
            select(Order)
            .options(selectinload(Order.employee), selectinload(Order.order_type))
            .where(where_clause)
            .order_by(Order.created_date.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_next_order_number(self, db: AsyncSession, year: int) -> str:
        """Берёт номер последнего приказа по дате + 1, а не максимальный."""
        result = await db.execute(
            select(Order.order_number)
            .where(
                Order.is_deleted == False,
                Order.is_cancelled == False,
                extract("year", Order.order_date) == year,
            )
            .order_by(Order.id.desc())
            .limit(1)
        )
        last_order = result.scalar_one_or_none()

        if not last_order:
            return "01"

        last_num = int(last_order) if last_order.isdigit() else 0
        return f"{last_num + 1:02d}"

    async def get_years(self, db: AsyncSession) -> list[int]:
        result = await db.execute(
            select(extract("year", Order.order_date).label("yr"))
            .where(Order.is_deleted == False)
            .distinct()
            .order_by(func.extract("year", Order.order_date).desc())
        )
        return [int(row[0]) for row in result.all() if row[0]]

    async def create(self, db: AsyncSession, data: dict) -> Order:
        order = Order(**data)
        db.add(order)
        await db.flush()
        await db.refresh(order)
        hydrated = await self.get_by_id(db, order.id, include_deleted=True)
        return hydrated or order

    async def soft_delete(self, db: AsyncSession, order_id: int, user_id: str) -> bool:
        order = await self.get_by_id(db, order_id)
        if not order:
            return False
        order.is_deleted = True
        order.deleted_at = datetime.now()
        order.deleted_by = user_id
        await db.flush()
        return True

    async def cancel(self, db: AsyncSession, order_id: int, user_id: str) -> bool:
        """Пометить заказ как отменённый (не удаляет из БД)."""
        order = await self.get_by_id(db, order_id)
        if not order:
            return False
        order.is_cancelled = True
        order.cancelled_at = datetime.now()
        order.cancelled_by = user_id
        await db.flush()
        return True

    async def hard_delete(self, db: AsyncSession, order_id: int) -> bool:
        """Полное удаление заказа из БД."""
        order = await self.get_by_id(db, order_id, include_deleted=True)
        if not order:
            return False
        await db.delete(order)
        await db.flush()
        return True

    async def get_by_id(self, db: AsyncSession, order_id: int, include_deleted: bool = False) -> Optional[Order]:
        conditions = [Order.id == order_id]
        if not include_deleted:
            conditions.append(Order.is_deleted == False)
        result = await db.execute(
            select(Order)
            .options(selectinload(Order.employee), selectinload(Order.order_type))
            .where(and_(*conditions))
        )
        return result.scalar_one_or_none()

    async def get_cancelled_orders(self, db: AsyncSession, page: int = 1, per_page: int = 20) -> tuple[list[Order], int]:
        """Получить отменённые заказы."""
        conditions = [Order.is_deleted == False, Order.is_cancelled == True]
        where_clause = and_(*conditions)
        count_query = select(func.count(Order.id)).where(where_clause)
        total_result = await db.execute(count_query)
        total = total_result.scalar()
        data_query = (
            select(Order)
            .where(where_clause)
            .order_by(Order.created_date.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        result = await db.execute(data_query)
        items = list(result.scalars().all())
        return items, total


order_repository = OrderRepository()
