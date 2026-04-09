from datetime import date
from typing import Optional, List, Dict, Any

from sqlalchemy import select, func, and_, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.vacation import Vacation
from app.models.employee import Employee
from app.models.order import Order


class VacationRepository:
    async def create(self, db: AsyncSession, data: dict) -> Vacation:
        vacation = Vacation(**data)
        db.add(vacation)
        await db.flush()
        await db.refresh(vacation)
        return vacation

    async def get_by_id(self, db: AsyncSession, id: int) -> Optional[Vacation]:
        result = await db.execute(
            select(Vacation)
            .options(selectinload(Vacation.employee))
            .where(Vacation.id == id, Vacation.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        db: AsyncSession,
        employee_id: Optional[int] = None,
        year: Optional[int] = None,
        vacation_type: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[Vacation], int]:
        query = (
            select(Vacation)
            .options(selectinload(Vacation.employee))
            .where(Vacation.is_deleted == False)
        )

        if employee_id is not None:
            query = query.where(Vacation.employee_id == employee_id)
        if year is not None:
            query = query.where(func.extract("year", Vacation.start_date) == year)
        if vacation_type is not None:
            query = query.where(Vacation.vacation_type == vacation_type)

        count_query = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_query)).scalar() or 0

        query = query.order_by(Vacation.start_date.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await db.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def get_by_employee_id(
        self, db: AsyncSession, employee_id: int, year: Optional[int] = None
    ) -> list[Vacation]:
        query = (
            select(Vacation)
            .where(Vacation.employee_id == employee_id, Vacation.is_deleted == False)
            .order_by(Vacation.start_date.desc())
        )
        if year is not None:
            query = query.where(func.extract("year", Vacation.start_date) == year)

        result = await db.execute(query)
        return list(result.scalars().all())

    async def update(self, db: AsyncSession, id: int, data: dict) -> Optional[Vacation]:
        vacation = await self.get_by_id(db, id)
        if not vacation:
            return None
        for key, value in data.items():
            setattr(vacation, key, value)
        await db.flush()
        await db.refresh(vacation)
        return vacation

    async def soft_delete(self, db: AsyncSession, id: int, user_id: str) -> bool:
        vacation = await self.get_by_id(db, id)
        if not vacation:
            return False
        vacation.is_deleted = True
        vacation.deleted_at = func.now()
        vacation.deleted_by = user_id
        await db.flush()
        return True

    async def cancel(self, db: AsyncSession, id: int, user_id: str) -> bool:
        """Пометить отпуск как отменённый."""
        vacation = await self.get_by_id(db, id)
        if not vacation:
            return False
        vacation.is_cancelled = True
        vacation.cancelled_at = func.now()
        vacation.cancelled_by = user_id
        await db.flush()
        return True

    async def hard_delete(self, db: AsyncSession, id: int) -> bool:
        """Полное удаление отпуска из БД."""
        vacation = await self.get_by_id(db, id)
        if not vacation:
            return False
        await db.delete(vacation)
        await db.flush()
        return True

    async def check_overlap(
        self,
        db: AsyncSession,
        employee_id: int,
        start_date: date,
        end_date: date,
        exclude_id: Optional[int] = None,
    ) -> Optional[Vacation]:
        """Проверяет пересечение отпусков у одного сотрудника"""
        query = (
            select(Vacation)
            .where(
                Vacation.employee_id == employee_id,
                Vacation.is_deleted == False,
                Vacation.start_date <= end_date,
                Vacation.end_date >= start_date,
            )
        )
        if exclude_id is not None:
            query = query.where(Vacation.id != exclude_id)

        result = await db.execute(query)
        return result.scalars().first()

    async def get_used_days(
        self, db: AsyncSession, employee_id: int, year: int, vacation_type: str = "Трудовой"
    ) -> int:
        """
        Считает использованные дни отпуска за год.
        Только для указанного типа (по умолчанию "Трудовой").
        Если отпуск переходит через январь — считает только дни в этом году.
        НЕ считает отменённые отпуска.
        """
        query = (
            select(Vacation)
            .where(
                Vacation.employee_id == employee_id,
                Vacation.vacation_type == vacation_type,
                Vacation.is_deleted == False,
                Vacation.is_cancelled == False,
                Vacation.start_date <= date(year, 12, 31),
                Vacation.end_date >= date(year, 1, 1),
            )
        )

        result = await db.execute(query)
        vacations = list(result.scalars().all())

        total_days = 0
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)

        for vac in vacations:
            effective_start = max(vac.start_date, year_start)
            effective_end = min(vac.end_date, year_end)
            if effective_end >= effective_start:
                total_days += (effective_end - effective_start).days + 1

        return total_days

    async def get_vacation_balance(
        self, db: AsyncSession, employee_id: int, year: int
    ) -> dict:
        """
        Возвращает баланс отпусков сотрудника за год.
        {available_days, used_days, remaining_days, vacation_type_breakdown}
        """
        employee_result = await db.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        employee = employee_result.scalar_one_or_none()

        if not employee:
            return {
                "available_days": 0,
                "used_days": 0,
                "remaining_days": 0,
                "vacation_type_breakdown": {},
            }

        available_days = employee.vacation_days_override if employee.vacation_days_override is not None else 28
        used_days = await self.get_used_days(db, employee_id, year, "Трудовой")

        breakdown_result = await db.execute(
            select(
                Vacation.vacation_type,
                func.sum(Vacation.days_count).label("total_days"),
            )
            .where(
                Vacation.employee_id == employee_id,
                Vacation.is_deleted == False,
                func.extract("year", Vacation.start_date) == year,
            )
            .group_by(Vacation.vacation_type)
        )
        breakdown = {row[0]: row[1] for row in breakdown_result.all()}

        return {
            "available_days": available_days,
            "used_days": used_days,
            "remaining_days": available_days - used_days,
            "vacation_type_breakdown": breakdown,
        }

    async def get_employees_summary(
        self,
        db: AsyncSession,
        q: Optional[str] = None,
        archive_filter: str = "active",
    ) -> List[Dict[str, Any]]:
        """Возвращает всех активных сотрудников с остатком дней за всё время."""
        query = (
            select(
                Employee.id,
                Employee.tab_number,
                Employee.name,
                Employee.department,
                Employee.position,
                Employee.contract_start,
                Employee.vacation_days_override,
                Employee.additional_vacation_days,
            )
            .where(Employee.is_deleted == False)
        )

        if archive_filter == "active":
            query = query.where(Employee.is_archived == False)
        elif archive_filter == "archived":
            query = query.where(Employee.is_archived == True)

        if q:
            q_filter = f"%{q.lower()}%"
            query = query.where(
                (Employee.name.ilike(q_filter)) |
                (Employee.tab_number.cast(String).ilike(q_filter))
            )

        query = query.order_by(Employee.name)
        result = await db.execute(query)
        rows = result.all()

        employees_data = []
        for row in rows:
            emp_id = row.id
            contract_start = row.contract_start
            override = row.vacation_days_override
            additional_days = row.additional_vacation_days

            # Считаем все использованные дни:
            # 1. Реальные отпуска (из таблицы vacations)
            used_result = await db.execute(
                select(func.sum(Vacation.days_count))
                .where(Vacation.employee_id == emp_id, Vacation.is_deleted == False, Vacation.is_cancelled == False)
            )
            total_used_from_vacations = used_result.scalar() or 0
            
            # 2. Дополнительно списанные дни из закрытых периодов (из таблицы vacation_periods)
            # Берем сумму used_days из всех периодов
            from app.models.vacation_period import VacationPeriod
            periods_result = await db.execute(
                select(func.sum(VacationPeriod.used_days))
                .where(VacationPeriod.employee_id == emp_id)
            )
            total_used_from_periods = periods_result.scalar() or 0
            
            # Используем максимум из двух значений (periods включает в себя vacations + закрытые дни)
            total_used = max(total_used_from_vacations, total_used_from_periods)

            # Рассчитываем доступные дни (база 28 дней по ТК РФ + доп. дни)
            if contract_start:
                years_worked = (date.today() - contract_start).days / 365.25
                base_days = int(years_worked * 28)
                calculated_available = base_days + (additional_days or 0)
            else:
                calculated_available = None

            # Если есть override — используем его как базу
            if override is not None:
                available_days = override
            elif calculated_available is not None:
                available_days = calculated_available
            else:
                available_days = None

            # remaining = available - used
            if available_days is not None:
                remaining = available_days - total_used
            else:
                remaining = None

            employees_data.append({
                "id": emp_id,
                "tab_number": row.tab_number,
                "name": row.name,
                "department": row.department,
                "position": row.position,
                "contract_start": str(contract_start) if contract_start else None,
                "vacation_days_override": override,
                "additional_vacation_days": additional_days,
                "total_used_days": total_used,
                "calculated_available": calculated_available,
                "remaining_days": remaining,
            })

        return employees_data

    async def get_employee_vacation_history(
        self,
        db: AsyncSession,
        employee_id: int,
    ) -> Dict[str, Any]:
        """Возвращает историю отпусков сотрудника, сгруппированную по годам."""
        # Получаем сотрудника
        emp_result = await db.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        employee = emp_result.scalar_one_or_none()
        if not employee:
            return {"error": "Employee not found"}

        contract_start = employee.contract_start
        if not contract_start:
            start_year = date.today().year
        else:
            start_year = contract_start.year

        current_year = date.today().year

        # Получаем все отпуска сотрудника (включая отменённые)
        vac_result = await db.execute(
            select(Vacation)
            .where(Vacation.employee_id == employee_id, Vacation.is_deleted == False)
            .order_by(Vacation.start_date.desc())
        )
        vacations = list(vac_result.scalars().all())

        # Получаем номера приказов
        order_ids = [v.order_id for v in vacations if v.order_id is not None]
        order_map: dict[int, str] = {}
        if order_ids:
            order_result = await db.execute(
                select(Order.id, Order.order_number).where(Order.id.in_(order_ids))
            )
            order_map = {row[0]: row[1] for row in order_result.all()}

        years = []
        for year in range(current_year, start_year - 1, -1):
            year_vacations = []
            year_used = 0
            for v in vacations:
                v_year = v.start_date.year
                # Если отпуск跨年 (через год), считаем дни в этом году
                if v.start_date.year == year or (v.start_date.year < year and v.end_date.year >= year):
                    effective_start = max(v.start_date, date(year, 1, 1))
                    effective_end = min(v.end_date, date(year, 12, 31))
                    if effective_end >= effective_start:
                        days_in_year = (effective_end - effective_start).days + 1
                        year_used += days_in_year
                        year_vacations.append({
                            "id": v.id,
                            "order_id": v.order_id,
                            "start_date": str(v.start_date),
                            "end_date": str(v.end_date),
                            "days_count": days_in_year if v.start_date.year != year else v.days_count,
                            "vacation_type": v.vacation_type,
                            "order_number": order_map.get(v.order_id) if v.order_id else None,
                            "comment": v.comment,
                            "is_cancelled": v.is_cancelled,
                        })

            # Определяем available дней за год
            available_days = employee.vacation_days_override if employee.vacation_days_override is not None else 28

            years.append({
                "year": year,
                "used_days": year_used,
                "available_days": available_days,
                "vacations": year_vacations,
            })

        # Определяем общую дату начала контракта
        contract_start_str = str(employee.contract_start) if employee.contract_start else None

        return {
            "employee_id": employee.id,
            "employee_name": employee.name,
            "contract_start": contract_start_str,
            "vacation_days_correction": employee.vacation_days_correction,
            "years": years,
        }


vacation_repository = VacationRepository()
