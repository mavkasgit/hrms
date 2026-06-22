#!/bin/sh
set -e

# Ожидание доступности базы данных, используя настройки из DATABASE_URL
echo "Waiting for database..."
python -c '
import os, sys, socket, urllib.parse, time
db_url = os.getenv("DATABASE_URL")
if not db_url:
    sys.exit("DATABASE_URL is not set")
parsed = urllib.parse.urlparse(db_url.replace("postgresql+asyncpg://", "http://").replace("postgresql://", "http://"))
host = parsed.hostname or "postgres"
port = parsed.port or 5432
print(f"Waiting for database at {host}:{port}...")
for _ in range(30):
    try:
        s = socket.create_connection((host, port), 3)
        s.close()
        print("Database is up!")
        sys.exit(0)
    except Exception as e:
        print(f"Database not ready yet, retrying... ({e})")
        time.sleep(2)
sys.exit("Timeout waiting for database")
'

# Запуск скрипта исправления ревизий Alembic
echo "Running database revision mapping script..."
python scripts/migrate_production_version.py

# Применение миграций Alembic
echo "Running alembic migrations..."
alembic upgrade head

# Запуск бэкенда через uvicorn
echo "Starting backend server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
