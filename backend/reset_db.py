"""Reset database - drop all tables"""
import asyncio
from sqlalchemy import text
from app.core.database import engine


async def reset_db():
    async with engine.begin() as conn:
        # Drop all tables
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
    print("Database reset complete!")


if __name__ == "__main__":
    asyncio.run(reset_db())
