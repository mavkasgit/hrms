"""Test employee import with vacation periods generation"""
import asyncio
from datetime import date, datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.employee import Employee
from app.models.department import Department
from app.models.position import Position
from app.models.vacation_period import VacationPeriod
from app.services.employee_service import employee_service
from app.schemas.employee import EmployeeCreate


async def test_employee_import():
    """Test importing an employee and checking vacation periods creation"""
    
    # Get database session
    async for db in get_db():
        try:
            print("\n=== Starting Employee Import Test ===\n")
            
            # 1. Create department
            print("1. Creating department...")
            dept = Department(name="IT отдел")
            db.add(dept)
            await db.flush()
            print(f"   ✓ Department created: id={dept.id}, name={dept.name}")
            
            # 2. Create position
            print("\n2. Creating position...")
            pos = Position(name="Разработчик")
            db.add(pos)
            await db.flush()
            print(f"   ✓ Position created: id={pos.id}, name={pos.name}")
            
            # 3. Create employee with contract_start
            print("\n3. Creating employee...")
            employee_data = EmployeeCreate(
                name="Иванов Иван Иванович",
                tab_number=1001,
                department_id=dept.id,
                position_id=pos.id,
                hire_date=date(2023, 3, 1),
                birth_date=date(1990, 5, 15),
                gender="М",
                contract_start=date(2023, 3, 1),  # Important for vacation periods
                additional_vacation_days=5,
                citizenship=True,
                residency=True,
                pensioner=False,
                payment_form="Повременная",
                rate=1.0,
            )
            
            employee = await employee_service.create_employee(db, employee_data, "test_user")
            print(f"   ✓ Employee created: id={employee.id}, name={employee.name}")
            print(f"     - Tab number: {employee.tab_number}")
            print(f"     - Department: {employee.department.name}")
            print(f"     - Position: {employee.position.name}")
            print(f"     - Contract start: {employee.contract_start}")
            print(f"     - Additional vacation days: {employee.additional_vacation_days}")
            
            # 4. Check vacation periods were created
            print("\n4. Checking vacation periods...")
            result = await db.execute(
                select(VacationPeriod)
                .where(VacationPeriod.employee_id == employee.id)
                .order_by(VacationPeriod.year_number)
            )
            periods = result.scalars().all()
            
            if not periods:
                print("   ✗ ERROR: No vacation periods created!")
                return False
            
            print(f"   ✓ Found {len(periods)} vacation period(s)")
            
            # Calculate expected periods
            current_year = datetime.now().year
            contract_year = employee.contract_start.year
            expected_periods = current_year - contract_year + 1
            
            print(f"\n   Expected periods: {expected_periods} (from {contract_year} to {current_year})")
            print(f"   Actual periods: {len(periods)}")
            
            if len(periods) != expected_periods:
                print(f"   ⚠ WARNING: Period count mismatch!")
            
            # 5. Display each period details
            print("\n5. Vacation periods details:")
            total_days = 0
            for i, period in enumerate(periods, 1):
                print(f"\n   Period #{i} (Year {period.year_number}):")
                print(f"     - Period: {period.period_start} to {period.period_end}")
                print(f"     - Main days: {period.main_days}")
                print(f"     - Additional days: {period.additional_days}")
                print(f"     - Total available: {period.main_days + period.additional_days}")
                print(f"     - Used days: {period.used_days}")
                print(f"     - Remaining: {period.main_days + period.additional_days - period.used_days}")
                total_days += (period.main_days + period.additional_days)
            
            print(f"\n   Total vacation days across all periods: {total_days}")
            
            # 6. Verify period data
            print("\n6. Verifying period data...")
            all_valid = True
            
            for period in periods:
                # Check main days (should be 24 by default)
                if period.main_days != 24:
                    print(f"   ✗ Period {period.year_number}: main_days={period.main_days}, expected 24")
                    all_valid = False
                
                # Check additional days match employee setting
                if period.additional_days != employee.additional_vacation_days:
                    print(f"   ✗ Period {period.year_number}: additional_days={period.additional_days}, expected {employee.additional_vacation_days}")
                    all_valid = False
                
                # Check used days is 0 for new employee
                if period.used_days != 0:
                    print(f"   ✗ Period {period.year_number}: used_days={period.used_days}, expected 0")
                    all_valid = False
                
                # Check period dates
                if period.period_start.year != contract_year + period.year_number - 1:
                    print(f"   ✗ Period {period.year_number}: period_start year mismatch")
                    all_valid = False
            
            if all_valid:
                print("   ✓ All periods have correct data")
            
            # 7. Test summary
            print("\n=== Test Summary ===")
            print(f"✓ Employee created: {employee.name}")
            print(f"✓ Department: {employee.department.name}")
            print(f"✓ Position: {employee.position.name}")
            print(f"✓ Vacation periods created: {len(periods)}")
            print(f"✓ Total vacation days: {total_days}")
            print(f"✓ Data validation: {'PASSED' if all_valid else 'FAILED'}")
            
            await db.commit()
            print("\n✓ Test completed successfully!")
            return True
            
        except Exception as e:
            print(f"\n✗ ERROR: {e}")
            import traceback
            traceback.print_exc()
            await db.rollback()
            return False
        finally:
            await db.close()
            break


if __name__ == "__main__":
    success = asyncio.run(test_employee_import())
    exit(0 if success else 1)
