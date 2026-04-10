import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from app.core.config import settings


async def test():
    print(f"Connecting to: {settings.DATABASE_URL}")
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    try:
        async with AsyncSession(engine) as db:
            # Test query
            result = await db.execute(text("SELECT 1 as test"))
            print(f"Test query result: {result.all()}")
            
            # Employees query
            result = await db.execute(text("SELECT COUNT(*) FROM employees WHERE is_deleted = false"))
            print(f"Employees count: {result.all()}")
            
            # Vacation periods query
            result = await db.execute(text("SELECT COUNT(*) FROM vacation_periods"))
            print(f"Vacation periods count: {result.all()}")
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        await engine.dispose()


asyncio.run(test())