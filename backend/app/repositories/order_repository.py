from datetime import date
from typing import Optional

from sqlalchemy import select, func, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderSequence


class OrderRepository:
    async def get_by_id(self, db: AsyncSession, order_id: int) -> Optional[Order]:
        result = await db.execute(
            select(Order).where(Order.id == order_id, Order.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        db: AsyncSession,
        page: int = 1,
        per_page: int = 20,
        sort_by: Optional[str] = None,
        sort_order: str = "desc",
        year: Optional[int] = None,
    ) -> tuple[list[Order], int]:
        conditions = [Order.is_deleted == False]

        if year:
            conditions.append(extract("year", Order.created_date) == year)

        where_clause = and_(*conditions) if conditions else True

        count_query = select(func.count(Order.id)).where(where_clause)
        total_result = await db.execute(count_query)
        total = total_result.scalar()

        sort_column = getattr(Order, sort_by, Order.created_date) if sort_by else Order.created_date
        order_expr = sort_column.asc() if sort_order == "asc" else sort_column.desc()

        data_query = (
            select(Order)
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
        conditions = [Order.is_deleted == False]

        if year:
            conditions.append(extract("year", Order.created_date) == year)

        where_clause = and_(*conditions) if conditions else True

        result = await db.execute(
            select(Order)
            .where(where_clause)
            .order_by(Order.created_date.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_next_order_number(self, db: AsyncSession, year: int) -> str:
        stmt = select(OrderSequence).where(OrderSequence.year == year)
        result = await db.execute(stmt)
        sequence = result.scalar_one_or_none()

        if sequence is None:
            sequence = OrderSequence(year=year, last_number=0)
            db.add(sequence)
            await db.flush()

        sequence.last_number += 1
        next_number = sequence.last_number

        return f"{next_number:02d}"

    async def get_years(self, db: AsyncSession) -> list[int]:
        result = await db.execute(
            select(extract("year", Order.created_date).label("yr"))
            .where(Order.is_deleted == False)
            .distinct()
            .order_by(func.extract("year", Order.created_date).desc())
        )
        return [int(row[0]) for row in result.all() if row[0]]

    async def create(self, db: AsyncSession, data: dict) -> Order:
        order = Order(**data)
        db.add(order)
        await db.flush()
        await db.refresh(order)
        return order

    async def soft_delete(self, db: AsyncSession, order_id: int, user_id: str) -> bool:
        order = await self.get_by_id(db, order_id)
        if not order:
            return False
        order.is_deleted = True
        from datetime import datetime
        order.deleted_at = datetime.now()
        order.deleted_by = user_id
        await db.flush()
        return True
