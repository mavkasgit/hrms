import asyncio
from sqlalchemy import text
from app.core.database import get_db

async def delete_periods():
    async for db in get_db():
        await db.execute(text("DELETE FROM vacation_periods"))
        await db.commit()
        print("Deleted all vacation periods")
        break

asyncio.run(delete_periods())