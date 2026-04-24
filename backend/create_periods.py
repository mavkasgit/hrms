import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from app.core.config import settings
from datetime import date
from dateutil.relativedelta import relativedelta


async def create_periods():
    print(f"Connecting to: {settings.DATABASE_URL}")
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    
    async with AsyncSession(engine) as db:
        # Get employees with hire_date
        result = await db.execute(text("""
            SELECT id, name, hire_date, additional_vacation_days 
            FROM employees 
            WHERE is_deleted = false AND is_archived = false AND hire_date IS NOT NULL
            ORDER BY name
        """))
        employees = result.all()
        print(f"Found {len(employees)} employees with hire_date")
        
        today = date.today()
        periods_created = 0
        
        for emp in employees:
            emp_id, name, hire_date, additional_days = emp
            if not hire_date:
                continue
                
            # Calculate how many years worked
            rd = relativedelta(today, hire_date)
            years_worked = rd.years + (rd.months / 12)
            
            # Create periods for each year worked + current year
            years_to_create = int(years_worked) + 1
            if years_to_create > 5:
                years_to_create = 5  # Max 5 years back
                
            for year_num in range(1, years_to_create + 1):
                p_start = hire_date + relativedelta(months=12 * (year_num - 1))
                p_end = p_start + relativedelta(months=12) - relativedelta(days=1)
                
                # Check if period exists
                check = await db.execute(text("""
                    SELECT id FROM vacation_periods 
                    WHERE employee_id = :emp_id AND year_number = :year_num
                """), {"emp_id": emp_id, "year_num": year_num})
                exists = check.scalar()
                
                if not exists:
                    await db.execute(text("""
                        INSERT INTO vacation_periods 
                        (employee_id, period_start, period_end, main_days, additional_days, used_days, year_number)
                        VALUES (:emp_id, :p_start, :p_end, 24, :add_days, 0, :year_num)
                    """), {
                        "emp_id": emp_id,
                        "p_start": p_start,
                        "p_end": p_end,
                        "add_days": additional_days or 0,
                        "year_num": year_num
                    })
                    periods_created += 1
                    
            if periods_created > 0 and periods_created % 10 == 0:
                print(f"Created {periods_created} periods...")
                
        await db.commit()
        print(f"\nTotal periods created: {periods_created}")
        
        # Verify
        result = await db.execute(text("SELECT COUNT(*) FROM vacation_periods"))
        count = result.scalar()
        print(f"Total periods in DB: {count}")
        
    await engine.dispose()


asyncio.run(create_periods())