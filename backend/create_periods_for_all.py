"""Create vacation periods for all employees who don't have them"""
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.employee import Employee
from app.services.vacation_period_service import vacation_period_service


async def create_periods():
    """Create vacation periods for all employees"""
    
    async for db in get_db():
        try:
            print("\n=== Creating Vacation Periods for All Employees ===\n")
            
            # Get all employees with contract_start
            result = await db.execute(
                select(Employee)
                .where(
                    Employee.is_deleted == False,
                    Employee.contract_start.isnot(None)
                )
            )
            employees = result.scalars().all()
            
            print(f"Found {len(employees)} employees with contract_start\n")
            
            created_count = 0
            skipped_count = 0
            
            for emp in employees:
                print(f"Processing: {emp.name} (ID: {emp.id}, contract_start: {emp.contract_start})")
                
                try:
                    await vacation_period_service.ensure_periods_for_employee(
                        db,
                        employee_id=emp.id,
                        contract_start=emp.contract_start,
                        additional_days=emp.additional_vacation_days or 0
                    )
                    created_count += 1
                    print(f"  ✓ Periods created/updated")
                except Exception as e:
                    print(f"  ✗ Error: {e}")
                    skipped_count += 1
            
            await db.commit()
            
            print(f"\n=== Summary ===")
            print(f"✓ Processed: {created_count}")
            print(f"✗ Skipped: {skipped_count}")
            print(f"Total: {len(employees)}")
            
        except Exception as e:
            print(f"\n✗ ERROR: {e}")
            import traceback
            traceback.print_exc()
            await db.rollback()
        finally:
            await db.close()
            break


if __name__ == "__main__":
    asyncio.run(create_periods())
