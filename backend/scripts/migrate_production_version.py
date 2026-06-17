"""
Скрипт для обновления alembic_version на продакшен-сервере
после рефакторинга нумерации миграций.

Использует ТОТ ЖЕ драйвер (asyncpg), что и приложение.

Использование:
    python scripts/migrate_production_version.py              # применить
    python scripts/migrate_production_version.py --dry-run   # только показать
"""

import argparse
import asyncio
import os
import sys

import asyncpg

# Полный маппинг: старая ревизия -> новая ревизия
OLD_TO_NEW: dict[str, str] = {
    "0001_initial_schema": "001",
    "0002_order_types": "002",
    "0bfab6a26bb5": "003",
    "f88501f31469": "004",
    "9fb0d839a6df": "005",
    "3c89895478dc": "006",
    "7a1f2d9c6b4e": "007",
    "a1b2c3d4e5f6": "008",
    "20260504_0200": "009",
    "20260505_0100": "010",
    "add_substitution_order_type": "011",
    "20260506_0200": "012",
    "20260507_0100": "013",
    "20260507_0200": "014",
    "20260507_0300": "015",
    "20260507_0400": "016",
    "20260511_0100": "017",
    "20260511_0200": "018",
    "rename_archived_to_dismissed": "019",
    "20260512_0100": "020",
    "20260512_0200": "021",
    "20260512_0300": "022",
    "20260516_0100": "023",
    "20260516_0200": "024",
    "20260516_0300": "025",
    "20260516_0400": "026",
    "20260518_0100": "027",
    "20260518_0200": "028",
    "20260519_0100": "029",
    "20260601_0100": "030",
    "20260601_0200": "031",
    "308e1d51d6f2": "032",
    "20260616_0100": "033",
    "20260617_0100": "034",
}

HEAD_REVISION = "034"


async def main(dry_run: bool = False) -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("[ERROR] DATABASE_URL is not set.", file=sys.stderr)
        print("  Example: DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname")
        sys.exit(1)

    # asyncpg needs postgresql:// scheme, not postgresql+asyncpg://
    dsn = database_url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        conn = await asyncpg.connect(dsn)
    except Exception as e:
        print(f"[ERROR] Cannot connect to database: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        # Check if alembic_version table exists
        table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'alembic_version'
            )
        """)

        if not table_exists:
            print("[INFO] Table alembic_version does not exist yet.")
            print("       Run 'alembic upgrade head' to create it.")
            return

        current_version = await conn.fetchval("SELECT version_num FROM alembic_version")
        if current_version is None:
            print("[INFO] alembic_version is empty. Run 'alembic stamp {HEAD_REVISION}'.")
            return

        print(f"Current alembic_version: '{current_version}'")

        # Already on new format?
        if current_version == HEAD_REVISION:
            print(f"[OK] Already at '{HEAD_REVISION}'. Nothing to do.")
            return

        # Already a new-format revision (e.g., "015")?
        if current_version in OLD_TO_NEW.values():
            print(f"[OK] Already using new revision format ('{current_version}'). Nothing to do.")
            return

        # Map old to new
        new_version = OLD_TO_NEW.get(current_version)
        if not new_version:
            print(f"[WARN] Unknown revision '{current_version}'. Cannot map automatically.")
            print("       Please check the mapping table and update manually:")
            print(f"       UPDATE alembic_version SET version_num = '<new_rev>' WHERE version_num = '{current_version}';")
            sys.exit(1)

        if dry_run:
            print(f"[DRY RUN] Would update: '{current_version}' -> '{new_version}'")
            return

        # Perform update
        await conn.execute(
            "UPDATE alembic_version SET version_num = $1 WHERE version_num = $2",
            new_version, current_version,
        )
        print(f"[OK] Updated alembic_version: '{current_version}' -> '{new_version}'")
        print(f"     You can now run 'alembic upgrade head' safely.")

    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Update alembic_version after migration renumbering"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run))
