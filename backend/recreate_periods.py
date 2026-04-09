import asyncio
from sqlalchemy import select, text
from app.core.database import get_db
from app.models.employee import Employee
from app.services.vacation_period_service import vacation_period_service

async def recreate_periods():
    async for db in get_db():
        # Получаем всех сотрудников с contract_start
        result = await db.execute(
            select(Employee).where(Employee.contract_start.isnot(None)).order_by(Employee.id)
        )
        employees = result.scalars().all()
        
        for emp in employees:
            print(f"Employee {emp.id}: {emp.name}, contract_start={emp.contract_start}")
            # Создаём периоды с текущим additional_vacation_days
            await vacation_period_service.ensure_periods_for_employee(
                db, emp.id, emp.contract_start, emp.additional_vacation_days or 0
            )
        
        await db.commit()
        print(f"Created periods for {len(employees)} employees")
        break

asyncio.run(recreate_periods())