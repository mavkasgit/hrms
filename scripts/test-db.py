"""CLI for per-run isolated test databases (HRMS).

The test launcher (scripts/test-run.ps1) owns the lifecycle of a run-DB:

    test-db.py create  <db>    -- create run-DB + record owner row
    test-db.py verify  <db>    -- SELECT 1 against the run-DB
    test-db.py drop    <db>    -- terminate conns, drop run-DB, clear owner row
    test-db.py cleanup          -- drop orphan run-DBs by TTL (or unowned)
    test-db.py cleanup-legacy   -- one-shot sweep of legacy per-module DBs
                                  (dry-run by default; --apply to drop)

The owner row is written BEFORE ``CREATE DATABASE``, so an interrupted
launcher always leaves either no DB or a DB with an owner row that the TTL
cleanup can age. ``drop`` only removes a DB whose owner row matches, and TTL
cleanup skips any DB with active connections.

Names are strictly validated: only ``hrms_test_<12 hex>`` is ever touched.
Legacy per-module DBs (``hrms_test_<YYYYmmddHHMMSS>_<module>_*``) are handled
only by ``cleanup-legacy``.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import os
import re
import sys

import asyncpg

# --- Config (env-overridable; matches infra/compose/docker-compose.pytest.yml) ---
# TEST_DB_USER / TEST_DB_PASSWORD — единый контракт с launcher (scripts/test-run.ps1);
# TEST_DB_ADMIN_USER / TEST_DB_ADMIN_PASSWORD — обратная совместимость (CI).
POSTGRES_HOST = os.getenv("TEST_DB_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("TEST_DB_PORT", "5436"))
POSTGRES_USER = os.getenv("TEST_DB_USER") or os.getenv("TEST_DB_ADMIN_USER", "hrms_user")
POSTGRES_PASSWORD = os.getenv("TEST_DB_PASSWORD") or os.getenv("TEST_DB_ADMIN_PASSWORD", "hrms_pass")
POSTGRES_ADMIN_DB = os.getenv("TEST_DB_ADMIN_DATABASE", "postgres")

RUN_DB_PREFIX = "hrms_test_"
RUN_DB_RE = re.compile(r"^hrms_test_[0-9a-f]{12}$")
# Legacy per-module DBs created by the old conftest: hrms_test_<ts>_<module>_<unique>
LEGACY_DB_RE = re.compile(r"^hrms_test_\d{14}_[a-z0-9_]+_[0-9a-f]{8}$")
OWNER_TABLE = "hrms_test_owner"
DEFAULT_TTL_HOURS = float(os.getenv("TEST_DB_CLEANUP_TTL_HOURS", "24"))


def run_id_from_db_name(db_name: str) -> str:
    return db_name[len(RUN_DB_PREFIX):]


def validate_run_db_name(db_name: str) -> None:
    if not RUN_DB_RE.fullmatch(db_name):
        raise ValueError(
            f"Refusing to touch unsafe database name {db_name!r}: "
            f"must match {RUN_DB_RE.pattern}"
        )


async def _admin_conn() -> asyncpg.Connection:
    return await asyncpg.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        database=POSTGRES_ADMIN_DB,
    )


async def _ensure_owner_table(conn: asyncpg.Connection) -> None:
    await conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {OWNER_TABLE} (
            run_id        text PRIMARY KEY,
            db_name       text UNIQUE NOT NULL,
            created_at    timestamptz NOT NULL DEFAULT now(),
            last_seen_at  timestamptz
        )
        """
    )
    await conn.execute(
        f"CREATE INDEX IF NOT EXISTS {OWNER_TABLE}_created_at_idx "
        f"ON {OWNER_TABLE} (created_at)"
    )


async def _terminate_and_drop(conn: asyncpg.Connection, db_name: str) -> None:
    await conn.execute(
        "SELECT pg_terminate_backend(pid) "
        "FROM pg_stat_activity "
        "WHERE datname = $1 AND pid <> pg_backend_pid()",
        db_name,
    )
    await conn.execute(f'DROP DATABASE IF EXISTS "{db_name}"')


async def create(db_name: str) -> None:
    validate_run_db_name(db_name)
    run_id = run_id_from_db_name(db_name)
    conn = await _admin_conn()
    try:
        await _ensure_owner_table(conn)
        await conn.execute(
            f"INSERT INTO {OWNER_TABLE} (run_id, db_name) VALUES ($1, $2) "
            "ON CONFLICT (run_id) DO NOTHING",
            run_id,
            db_name,
        )
        try:
            await conn.execute(f'CREATE DATABASE "{db_name}"')
        except asyncpg.DuplicateDatabaseError:
            pass
    except BaseException:
        await conn.execute(
            f"DELETE FROM {OWNER_TABLE} WHERE run_id = $1", run_id
        )
        raise
    finally:
        await conn.close()
    print(f"Created test database: {db_name}")


async def verify(db_name: str) -> None:
    validate_run_db_name(db_name)
    conn = await asyncpg.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        database=db_name,
    )
    try:
        value = await conn.fetchval("SELECT 1")
        if value != 1:
            raise RuntimeError(f"SELECT 1 on {db_name} returned {value!r}")
    finally:
        await conn.close()
    print(f"Verified test database: {db_name}")


async def drop(db_name: str) -> None:
    validate_run_db_name(db_name)
    run_id = run_id_from_db_name(db_name)
    conn = await _admin_conn()
    try:
        await _ensure_owner_table(conn)
        owner = await conn.fetchrow(
            f"SELECT db_name FROM {OWNER_TABLE} WHERE run_id = $1", run_id
        )
        if owner is None or owner["db_name"] != db_name:
            print(f"Skip drop {db_name}: no matching owner row")
            return
        await _terminate_and_drop(conn, db_name)
        await conn.execute(
            f"DELETE FROM {OWNER_TABLE} WHERE run_id = $1", run_id
        )
    finally:
        await conn.close()
    print(f"Dropped test database: {db_name}")


async def cleanup(ttl_hours: float, dry_run: bool = False) -> None:
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
        hours=ttl_hours
    )
    conn = await _admin_conn()
    dropped = 0
    try:
        await _ensure_owner_table(conn)
        rows = await conn.fetch(
            "SELECT datname FROM pg_database WHERE datname LIKE $1",
            f"{RUN_DB_PREFIX}%",
        )
        for row in rows:
            db_name = row["datname"]
            if not RUN_DB_RE.fullmatch(db_name):
                continue
            active = await conn.fetchval(
                "SELECT count(*) FROM pg_stat_activity "
                "WHERE datname = $1 AND pid <> pg_backend_pid()",
                db_name,
            )
            if active:
                print(f"SKIP  {db_name}: active connections ({active})")
                continue
            has_owner = await conn.fetchval(
                f"SELECT 1 FROM {OWNER_TABLE} WHERE db_name = $1", db_name
            )
            if has_owner:
                old = await conn.fetchval(
                    f"SELECT 1 FROM {OWNER_TABLE} "
                    "WHERE db_name = $1 AND created_at < $2",
                    db_name,
                    cutoff,
                )
                if not old:
                    print(f"SKIP  {db_name}: younger than {ttl_hours:g}h TTL")
                    continue
                reason = f"older than {ttl_hours:g}h TTL"
            else:
                reason = "unowned orphan"
            if dry_run:
                print(f"DRY   {db_name}: {reason}")
            else:
                print(f"DROP  {db_name}: {reason}")
                await _terminate_and_drop(conn, db_name)
                await conn.execute(
                    f"DELETE FROM {OWNER_TABLE} WHERE db_name = $1", db_name
                )
                dropped += 1
    finally:
        await conn.close()
    print(f"Cleanup finished. Dropped {dropped} database(s).")


async def cleanup_legacy(dry_run: bool = False) -> None:
    """One-shot sweep of legacy per-module DBs (old conftest model).

    Only drops names matching the legacy pattern; run-DBs and the static
    shared DB (``hrms_test``) are never touched. Dry-run by default.
    """
    conn = await _admin_conn()
    dropped = 0
    try:
        rows = await conn.fetch(
            "SELECT datname FROM pg_database WHERE datname LIKE $1",
            f"{RUN_DB_PREFIX}%",
        )
        for row in rows:
            db_name = row["datname"]
            if not LEGACY_DB_RE.fullmatch(db_name):
                continue
            active = await conn.fetchval(
                "SELECT count(*) FROM pg_stat_activity "
                "WHERE datname = $1 AND pid <> pg_backend_pid()",
                db_name,
            )
            if active:
                print(f"SKIP  {db_name}: active connections ({active})")
                continue
            if dry_run:
                print(f"DRY   {db_name}: legacy per-module DB")
            else:
                print(f"DROP  {db_name}: legacy per-module DB")
                await _terminate_and_drop(conn, db_name)
                dropped += 1
    finally:
        await conn.close()
    print(f"Legacy cleanup finished. Dropped {dropped} database(s).")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="test-db.py",
        description="Per-run isolated test databases (HRMS).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_create = sub.add_parser("create", help="create a run-DB")
    p_create.add_argument("db_name")

    p_verify = sub.add_parser("verify", help="SELECT 1 against a run-DB")
    p_verify.add_argument("db_name")

    p_drop = sub.add_parser("drop", help="drop a run-DB owned by this run")
    p_drop.add_argument("db_name")

    p_cleanup = sub.add_parser("cleanup", help="drop orphan run-DBs by TTL")
    p_cleanup.add_argument("--ttl-hours", type=float, default=DEFAULT_TTL_HOURS)
    p_cleanup.add_argument("--dry-run", action="store_true")

    p_legacy = sub.add_parser(
        "cleanup-legacy", help="one-shot sweep of legacy per-module DBs"
    )
    p_legacy.add_argument("--apply", action="store_true", help="actually drop")

    args = parser.parse_args()

    async def _run() -> None:
        if args.command == "create":
            await create(args.db_name)
        elif args.command == "verify":
            await verify(args.db_name)
        elif args.command == "drop":
            await drop(args.db_name)
        elif args.command == "cleanup":
            await cleanup(args.ttl_hours, args.dry_run)
        elif args.command == "cleanup-legacy":
            await cleanup_legacy(args.apply)
        else:  # pragma: no cover
            parser.error(f"Unknown command: {args.command}")

    try:
        asyncio.run(_run())
    except (ValueError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
