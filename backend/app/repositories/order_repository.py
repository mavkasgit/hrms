from datetime import datetime
from typing import Optional

from sqlalchemy import and_, extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order
from app.models.order_employee import OrderEmployee
from app.models.order_type import OrderType
from app.models.employee import Employee


class OrderRepository:
    async def get_all(
        self,
        db: AsyncSession,
        page: int = 1,
        per_page: int = 20,
        sort_by: Optional[str] = None,
        sort_order: str = "desc",
        year: Optional[int] = None,
        order_type_code: Optional[str] = None,
        order_letter: Optional[str] = None,
        employee_id: Optional[int] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        order_number: Optional[str] = None,
    ) -> tuple[list[Order], int]:
        conditions = [Order.is_deleted == False]
        joins = []

        if year:
            conditions.append(extract("year", Order.order_date) == year)

        if order_type_code:
            joins.append(OrderType)
            codes = [c.strip() for c in order_type_code.split(",") if c.strip()]
            sub_conds = []
            for code in codes:
                if code == "vacation_unpaid":
                    sub_conds.append(
                        OrderType.code.in_(["vacation_unpaid", "vacation_unpaid_group"])
                    )
                elif code == "weekend_call":
                    sub_conds.append(
                        OrderType.code.in_(["weekend_call", "weekend_call_group"])
                    )
                else:
                    sub_conds.append(OrderType.code == code)
            if sub_conds:
                conditions.append(or_(*sub_conds))

        if order_letter:
            if OrderType not in joins:
                joins.append(OrderType)
            conditions.append(OrderType.letter == order_letter)

        if employee_id:
            group_order_subq = select(OrderEmployee.order_id).where(OrderEmployee.employee_id == employee_id)
            conditions.append(
                or_(Order.employee_id == employee_id, Order.id.in_(group_order_subq))
            )

        if date_from:
            conditions.append(Order.order_date >= date_from)

        if date_to:
            conditions.append(Order.order_date <= date_to)

        if order_number:
            conditions.append(Order.order_number.ilike(f"%{order_number}%"))

        where_clause = and_(*conditions) if conditions else True

        count_query = select(func.count(Order.id)).select_from(Order)
        for join_model in joins:
            count_query = count_query.join(join_model)
        count_query = count_query.where(where_clause)
        total_result = await db.execute(count_query)
        total = total_result.scalar()

        sort_column = getattr(Order, sort_by, Order.created_date) if sort_by else Order.created_date
        order_expr = sort_column.asc() if sort_order == "asc" else sort_column.desc()

        data_query = select(Order).options(
            selectinload(Order.employee),
            selectinload(Order.order_type),
            selectinload(Order.employees)
                .selectinload(OrderEmployee.employee)
                .selectinload(Employee.position),
            selectinload(Order.employees)
                .selectinload(OrderEmployee.employee)
                .selectinload(Employee.department),
        )
        for join_model in joins:
            data_query = data_query.join(join_model)
        data_query = (
            data_query.where(where_clause).order_by(order_expr).offset((page - 1) * per_page).limit(per_page)
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
            conditions.append(extract("year", Order.order_date) == year)

        where_clause = and_(*conditions) if conditions else True

        result = await db.execute(
            select(Order)
            .options(
                selectinload(Order.employee),
                selectinload(Order.order_type),
                selectinload(Order.employees)
                    .selectinload(OrderEmployee.employee)
                    .selectinload(Employee.position),
                selectinload(Order.employees)
                    .selectinload(OrderEmployee.employee)
                    .selectinload(Employee.department),
            )
            .where(where_clause)
            .order_by(Order.created_date.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_next_order_number(self, db: AsyncSession, order_type_id: int) -> str:
        """Возвращает следующий номер приказа для заданного типа (по литере).

        Нумерация сквозная: берем последний приказ с той же литерой (по id DESC),
        парсим числовую часть, +1. Формат: '{N}-{letter}' или '{N}' для приказов без литеры.
        """
        from app.models.order_type import OrderType

        # Получаем литеру типа приказа
        type_result = await db.execute(
            select(OrderType.letter).where(OrderType.id == order_type_id)
        )
        letter = type_result.scalar_one_or_none()

        # Для приказов без литеры — простая нумерация без суффикса
        if not letter:
            result = await db.execute(
                select(Order.order_number)
                .join(OrderType, Order.order_type_id == OrderType.id)
                .where(
                    Order.is_deleted == False,
                    OrderType.letter.is_(None),
                )
                .order_by(Order.id.desc())
                .limit(1)
            )
            last_order = result.scalar_one_or_none()

            if not last_order:
                return "1"

            import re
            match = re.search(r'\d+', last_order)
            last_num = int(match.group()) if match else 0
            return str(last_num + 1)

        # Ищем последний приказ с той же литерой
        result = await db.execute(
            select(Order.order_number)
            .join(OrderType, Order.order_type_id == OrderType.id)
            .where(
                Order.is_deleted == False,
                OrderType.letter == letter,
            )
            .order_by(Order.id.desc())
            .limit(1)
        )
        last_order = result.scalar_one_or_none()

        if not last_order:
            return f"1-{letter}"

        # Парсим первое число из части до дефиса (игнорируем дроби и символы)
        import re
        numeric_part = last_order.split("-")[0]
        match = re.search(r'\d+', numeric_part)
        last_num = int(match.group()) if match else 0

        return f"{last_num + 1}-{letter}"

    async def get_years(self, db: AsyncSession) -> list[int]:
        result = await db.execute(
            select(extract("year", Order.order_date).label("yr"))
            .where(Order.is_deleted == False)
            .distinct()
            .order_by(func.extract("year", Order.order_date).desc())
        )
        return [int(row[0]) for row in result.all() if row[0]]

    async def get_recent_by_order_type(self, db: AsyncSession, order_type_id: int, limit: int = 5) -> list[Order]:
        result = await db.execute(
            select(Order)
            .where(Order.is_deleted == False, Order.order_type_id == order_type_id)
            .order_by(Order.created_date.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

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
            .options(
                selectinload(Order.employee),
                selectinload(Order.order_type),
                selectinload(Order.employees)
                    .selectinload(OrderEmployee.employee)
                    .selectinload(Employee.position),
                selectinload(Order.employees)
                    .selectinload(OrderEmployee.employee)
                    .selectinload(Employee.department),
            )
            .where(and_(*conditions))
        )
        return result.scalar_one_or_none()


order_repository = OrderRepository()
