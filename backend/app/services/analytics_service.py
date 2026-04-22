from datetime import date, datetime
from typing import Optional

from sqlalchemy import select, func, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee


class AnalyticsService:
    @staticmethod
    async def get_dashboard_stats(db: AsyncSession, department_id: Optional[int] = None, gender: Optional[str] = None) -> dict:
        conditions = [
            Employee.is_deleted == False,
            Employee.is_archived == False,
        ]
        if department_id:
            conditions.append(Employee.department_id == department_id)
        if gender:
            conditions.append(Employee.gender == gender)

        where_clause = and_(*conditions)

        # Общее количество
        total_result = await db.execute(
            select(func.count(Employee.id)).where(where_clause)
        )
        total = total_result.scalar() or 0

        # Мужчины
        male_result = await db.execute(
            select(func.count(Employee.id)).where(
                and_(*conditions, Employee.gender == "М")
            )
        )
        male_count = male_result.scalar() or 0

        # Женщины
        female_result = await db.execute(
            select(func.count(Employee.id)).where(
                and_(*conditions, Employee.gender == "Ж")
            )
        )
        female_count = female_result.scalar() or 0

        # Средний возраст
        age_result = await db.execute(
            select(Employee.birth_date).where(
                and_(*conditions, Employee.birth_date.isnot(None))
            )
        )
        birth_dates = [row[0] for row in age_result.all() if row[0]]
        if birth_dates:
            today = date.today()
            ages = [
                (today - bd).days / 365.25
                for bd in birth_dates
            ]
            avg_age = round(sum(ages) / len(ages), 1)
        else:
            avg_age = 0.0

        # Средний стаж
        tenure_result = await db.execute(
            select(Employee.hire_date).where(
                and_(*conditions, Employee.hire_date.isnot(None))
            )
        )
        hire_dates = [row[0] for row in tenure_result.all() if row[0]]
        if hire_dates:
            today = date.today()
            tenures = [
                (today - hd).days / 365.25
                for hd in hire_dates
            ]
            avg_tenure = round(sum(tenures) / len(tenures), 1)
        else:
            avg_tenure = 0.0

        return {
            "total": total,
            "male_count": male_count,
            "female_count": female_count,
            "avg_age": avg_age,
            "avg_tenure": avg_tenure,
        }

    @staticmethod
    async def get_upcoming_birthdays(db: AsyncSession, days: int = 30, gender: Optional[str] = None) -> list[dict]:
        today = date.today()
        end_date = today + __import__('datetime').timedelta(days=days)

        conditions = [
            Employee.is_deleted == False,
            Employee.is_archived == False,
            Employee.birth_date.isnot(None),
        ]
        if gender:
            conditions.append(Employee.gender == gender)

        from app.models.department import Department
        
        # Получаем всех активных сотрудников с датой рождения
        result = await db.execute(
            select(Employee, Department.name, Department.color, Department.icon)
            .join(Department, Employee.department_id == Department.id)
            .where(and_(*conditions))
        )
        rows = result.all()

        birthdays = []
        for emp, dept_name, dept_color, dept_icon in rows:
            if not emp.birth_date:
                continue

            # Вычисляем следующий день рождения
            next_birthday = emp.birth_date.replace(year=today.year)
            if next_birthday < today:
                next_birthday = emp.birth_date.replace(year=today.year + 1)

            # Если в пределах диапазона
            if today <= next_birthday <= end_date:
                age = next_birthday.year - emp.birth_date.year
                days_until = (next_birthday - today).days

                birthdays.append({
                    "id": emp.id,
                    "name": emp.name,
                    "department": dept_name,
                    "department_color": dept_color,
                    "department_icon": dept_icon,
                    "birth_date": emp.birth_date.isoformat(),
                    "age": age,
                    "days_until": days_until,
                })

        # Сортируем по близости даты
        birthdays.sort(key=lambda x: x["days_until"])
        return birthdays

    @staticmethod
    async def get_contract_expiring(
        db: AsyncSession,
        department_id: Optional[int] = None,
        gender: Optional[str] = None,
    ) -> list[dict]:
        today = date.today()

        conditions = [
            Employee.is_deleted == False,
            Employee.is_archived == False,
        ]
        if department_id:
            conditions.append(Employee.department_id == department_id)
        if gender:
            conditions.append(Employee.gender == gender)

        from app.models.department import Department
        from app.models.position import Position

        result = await db.execute(
            select(Employee, Department.name, Department.color, Department.icon, Position.name)
            .join(Department, Employee.department_id == Department.id)
            .join(Position, Employee.position_id == Position.id)
            .where(and_(*conditions))
            .order_by(Employee.contract_end.asc().nullsfirst())
        )
        rows = result.all()

        contracts = []
        for emp, dept_name, dept_color, dept_icon, pos_name in rows:
            if emp.contract_end:
                days_left = (emp.contract_end - today).days
                contracts.append({
                    "id": emp.id,
                    "name": emp.name,
                    "department": dept_name,
                    "department_color": dept_color,
                    "department_icon": dept_icon,
                    "position": pos_name,
                    "contract_end": emp.contract_end.isoformat(),
                    "days_left": days_left,
                })
            else:
                contracts.append({
                    "id": emp.id,
                    "name": emp.name,
                    "department": dept_name,
                    "department_color": dept_color,
                    "department_icon": dept_icon,
                    "position": pos_name,
                    "contract_end": None,
                    "days_left": None,
                })

        return contracts

    @staticmethod
    async def get_department_distribution(
        db: AsyncSession,
        department_id: Optional[int] = None,
        gender: Optional[str] = None,
    ) -> list[dict]:
        from app.models.department import Department
        from app.models.position import Position

        conditions = [
            Employee.is_deleted == False,
            Employee.is_archived == False,
        ]
        if gender:
            conditions.append(Employee.gender == gender)

        # Если выбран конкретный отдел, группируем по позициям внутри него
        if department_id:
            conditions.append(Employee.department_id == department_id)
            result = await db.execute(
                select(
                    Position.name.label("position"),
                    func.count(Employee.id).label("count")
                )
                .join(Position, Employee.position_id == Position.id)
                .where(and_(*conditions))
                .group_by(Position.name)
                .order_by(func.count(Employee.id).desc())
            )
        else:
            result = await db.execute(
                select(
                    Department.name.label("department"),
                    Department.color.label("color"),
                    Department.icon.label("icon"),
                    func.count(Employee.id).label("count")
                )
                .join(Department, Employee.department_id == Department.id)
                .where(and_(*conditions))
                .group_by(Department.name, Department.color, Department.icon)
                .order_by(func.count(Employee.id).desc())
            )
        rows = result.all()

        if department_id:
            return [
                {"position": row[0], "count": row[3]}
                for row in rows
                if row[0]
            ]
        else:
            return [
                {"department": row[0], "color": row[1], "icon": row[2], "count": row[3]}
                for row in rows
                if row[0]
            ]
