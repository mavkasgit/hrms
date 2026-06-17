import asyncio
import sys
from sqlalchemy import text
from app.core.database import engine

async def create_user(username: str, full_name: str):
    async with engine.begin() as conn:
        # Check if user already exists
        result = await conn.execute(
            text("SELECT id FROM users WHERE username = :username"),
            {"username": username}
        )
        user = result.fetchone()
        if user:
            print(f"Пользователь '{username}' уже существует в базе данных HRMS.")
            return

        # Insert user
        await conn.execute(
            text("""
                INSERT INTO users (username, password_hash, role, full_name, is_deleted)
                VALUES (:username, 'sso_bypass_hash', 'admin', :full_name, false)
            """),
            {"username": username, "full_name": full_name}
        )
    print(f"Пользователь '{username}' ('{full_name}') успешно добавлен в HRMS с ролью 'admin'!")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Использование: python create_user.py <username> <full_name>")
        sys.exit(1)
    username = sys.argv[1]
    full_name = sys.argv[2]
    asyncio.run(create_user(username, full_name))
