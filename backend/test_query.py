import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from app.core.config import settings
from datetime import date


async def test_employees_summary():
    print(f"Connecting to: {settings.DATABASE_URL}")
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    
    async with AsyncSession(engine) as db:
        # Try the same query as vacation_repository
        result = await db.execute(text("""
            SELECT id, tab_number, name, department_id, position_id, hire_date, additional_vacation_days
            FROM employees 
            WHERE is_deleted = false AND is_archived = false
            ORDER BY name
            LIMIT 3
        """))
        rows = result.all()
        print(f"Got {len(rows)} rows")
        
        for row in rows:
            emp_id, tab_num, name, dept_id, pos_id, hire_date, add_days = row
            print(f"Employee: {emp_id} {name}, hire_date: {hire_date}, add_days: {add_days}")
            
            # Test query for vacation periods (this is what causes the error!)
            periods_result = await db.execute(text("""
                SELECT COALESCE(SUM(used_days), 0) as used 
                FROM vacation_periods 
                WHERE employee_id = :emp_id
            """), {"emp_id": emp_id})
            used = periods_result.scalar()
            print(f"  Used days from periods: {used}")
            
            # Test query for vacations
            vac_result = await db.execute(text("""
                SELECT COALESCE(SUM(days_count), 0) as used 
                FROM vacations 
                WHERE employee_id = :emp_id AND is_deleted = false AND is_cancelled = false
            """), {"emp_id": emp_id})
            used_vac = vac_result.scalar()
            print(f"  Used days from vacations: {used_vac}")
        
    await engine.dispose()


asyncio.run(test_employees_summary())