from datetime import date
from typing import Optional, List, Dict, Any

from sqlalchemy import select, func, and_, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.vacation import Vacation
from app.models.vacation_period import VacationPeriod
from app.models.employee import Employee


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
            .options(selectinload(Vacation.employee), selectinload(Vacation.order))
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
            .options(selectinload(Vacation.employee), selectinload(Vacation.order))
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
            .options(selectinload(Vacation.order))
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

    async def _get_used_days_for_period(self, db: AsyncSession, period_id: int) -> int:
        """Считает использованные дни для конкретного периода из таблицы vacations."""
        from datetime import date as date_type

        period = await db.get(VacationPeriod, period_id)
        if not period:
            return 0

        today = date_type.today()

        if today > period.period_end:
            end_date = period.period_end
        else:
            end_date = today

        result = await db.execute(
            select(func.sum(Vacation.days_count))
            .where(
                Vacation.employee_id == period.employee_id,
                Vacation.is_deleted == False,
                Vacation.is_cancelled == False,
                Vacation.start_date >= period.period_start,
                Vacation.start_date <= end_date,
            )
        )
        return result.scalar() or 0

    async def get_vacation_balance(
        self, db: AsyncSession, employee_id: int, year: Optional[int] = None
    ) -> dict:
        """
        Возвращает баланс отпусков сотрудника за год.
        {available_days, used_days, remaining_days, vacation_type_breakdown}
        """
        from app.models.vacation_period import VacationPeriod
        from datetime import date as date_type

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

        today = date_type.today()

        if year is None:
            periods_result = await db.execute(
                select(VacationPeriod)
                .where(
                    VacationPeriod.employee_id == employee_id,
                    VacationPeriod.period_start <= today,
                )
                .order_by(VacationPeriod.year_number)
            )
        else:
            year_start = date_type(year, 1, 1)
            year_end = date_type(year, 12, 31)
            periods_result = await db.execute(
                select(VacationPeriod)
                .where(
                    VacationPeriod.employee_id == employee_id,
                    VacationPeriod.period_start >= year_start,
                    VacationPeriod.period_start <= year_end,
                )
                .order_by(VacationPeriod.year_number)
            )

        periods = periods_result.scalars().all()

        total_available = 0
        total_used = 0

        for period in periods:
            full_days = period.main_days + period.additional_days
            used_days = period.used_days or 0
            
            # Закрытый период - used >= total или явно сохранённый remaining_days
            is_closed = used_days >= full_days or period.remaining_days is not None

            if is_closed:
                used = used_days
                period_total = full_days
            else:
                used = await self._get_used_days_for_period(db, period.id)
                if period.period_start <= today <= period.period_end:
                    from dateutil.relativedelta import relativedelta
                    rd = relativedelta(today, period.period_start)
                    months_passed = rd.years * 12 + rd.months
                    if rd.days > 0:
                        months_passed += 1
                    accrued = round(full_days / 12 * months_passed)
                    period_total = accrued
                else:
                    period_total = full_days

            total_available += period_total
            total_used += used

        breakdown_query = select(
            Vacation.vacation_type,
            func.sum(Vacation.days_count).label("total_days"),
        ).where(
            Vacation.employee_id == employee_id,
            Vacation.is_deleted == False,
        )

        if year is not None:
            breakdown_query = breakdown_query.where(
                func.extract("year", Vacation.start_date) == year
            )

        breakdown_query = breakdown_query.group_by(Vacation.vacation_type)
        breakdown_result = await db.execute(breakdown_query)
        breakdown = {row[0]: row[1] for row in breakdown_result.all()}

        return {
            "available_days": total_available,
            "used_days": total_used,
            "remaining_days": total_available - total_used,
            "vacation_type_breakdown": breakdown,
        }

    async def get_employees_summary(
        self,
        db: AsyncSession,
        q: Optional[str] = None,
        archive_filter: str = "active",
    ) -> List[Dict[str, Any]]:
        """Возвращает всех активных сотрудников с остатком дней за всё время."""
        from sqlalchemy.orm import joinedload
        
        query = (
            select(Employee)
            .options(joinedload(Employee.department), joinedload(Employee.position))
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
        employees = result.scalars().all()

        employees_data = []
        for emp in employees:
            emp_id = emp.id
            hire_date = emp.hire_date
            additional_days = emp.additional_vacation_days

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

            # Рассчитываем доступные дни и остаток из ТЕКУЩЕГО открытого периода
            # Находим текущий период (где сегодня между period_start и period_end)
            from datetime import date as date_type
            today = date_type.today()
            
            current_period_result = await db.execute(
                select(VacationPeriod)
                .where(
                    VacationPeriod.employee_id == emp_id,
                    VacationPeriod.period_start <= today,
                    VacationPeriod.period_end >= today
                )
            )
            current_period = current_period_result.scalar_one_or_none()
            
            if current_period:
                # Считаем остаток = (все прошлые периоды + текущий accrued) - использованные со всех периодов
                from app.repositories.vacation_period_repository import VacationPeriodRepository
                from dateutil.relativedelta import relativedelta
                
                period_repo = VacationPeriodRepository()
                
                # Получаем ВСЕ периоды сотрудника
                all_periods_result = await db.execute(
                    select(VacationPeriod)
                    .where(
                        VacationPeriod.employee_id == emp_id,
                        VacationPeriod.period_start <= today
                    )
                    .order_by(VacationPeriod.year_number)
                )
                all_periods = all_periods_result.scalars().all()
                
                # Считаем доступные дни
                total_available = 0
                for p in all_periods:
                    period_days = p.main_days + p.additional_days
                    
                    if p.id == current_period.id:
                        # Текущий период - считаем помесячно
                        rd = relativedelta(today, p.period_start)
                        months_passed = rd.years * 12 + rd.months
                        if rd.days > 0:
                            months_passed += 1
                        months_passed = min(months_passed, 12)
                        accrued = round(period_days / 12 * months_passed)
                        total_available += accrued
                    elif p.period_end < today:
                        # Прошлый период - берем полностью
                        total_available += period_days
                
                # Считаем использованные дни со ВСЕХ периодов
                total_used_result = await db.execute(
                    select(func.sum(Vacation.days_count))
                    .where(
                        Vacation.employee_id == emp_id,
                        Vacation.is_deleted == False,
                        Vacation.is_cancelled == False
                    )
                )
                total_used = total_used_result.scalar() or 0
                
                # Также учитываем вручную списанные дни из закрытых периодов
                manual_used_result = await db.execute(
                    select(func.sum(VacationPeriod.used_days))
                    .where(VacationPeriod.employee_id == emp_id)
                )
                manual_used = manual_used_result.scalar() or 0
                
                # Берем максимум (periods.used_days включает vacations + закрытые дни)
                total_used = max(total_used, manual_used)
                
                remaining = total_available - total_used
            else:
                # Если нет текущего периода, показываем 0
                remaining = 0
            
            # Для calculated_available показываем сумму всех периодов (для истории)
            # Получаем все периоды и суммируем вручную, исключая будущие периоды
            all_periods_result = await db.execute(
                select(VacationPeriod)
                .where(
                    VacationPeriod.employee_id == emp_id,
                    VacationPeriod.period_start <= today
                )
            )
            all_periods = all_periods_result.scalars().all()
            calculated_available = sum((p.main_days + p.additional_days) for p in all_periods)

            employees_data.append({
                "id": emp_id,
                "tab_number": emp.tab_number,
                "name": emp.name,
                "department": emp.department.name if emp.department else "",
                "position": emp.position.name if emp.position else "",
                "hire_date": str(hire_date) if hire_date else None,
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

        hire_date = employee.hire_date
        if not hire_date:
            start_year = date.today().year
        else:
            start_year = hire_date.year

        current_year = date.today().year

        # Получаем все отпуска сотрудника (включая отменённые)
        vac_result = await db.execute(
            select(Vacation)
            .options(selectinload(Vacation.order))
            .where(Vacation.employee_id == employee_id, Vacation.is_deleted == False)
            .order_by(Vacation.start_date.desc())
        )
        vacations = list(vac_result.scalars().all())

        # Получаем номера приказов
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
                            "order_number": v.order.order_number if getattr(v, "order", None) else None,
                            "comment": v.comment,
                            "is_cancelled": v.is_cancelled,
                        })

            # Определяем available дней за год
            # Используем новую систему периодов вместо vacation_days_override
            available_days = 28  # Базовое значение

            years.append({
                "year": year,
                "used_days": year_used,
                "available_days": available_days,
                "vacations": year_vacations,
            })

        # Определяем дату приема на работу
        hire_date_str = str(employee.hire_date) if employee.hire_date else None

        return {
            "employee_id": employee.id,
            "employee_name": employee.name,
            "hire_date": hire_date_str,
            "years": years,
        }


vacation_repository = VacationRepository()
