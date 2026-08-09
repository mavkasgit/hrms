"""Pytest fixtures for backend tests.

Isolation model (launcher owns run-DB):
- ``scripts/test-run.ps1`` (``npm run test:pytest``) is the single entry
  point: it generates a ``RUN_ID`` (12 hex), creates an ephemeral
  ``hrms_test_<runid>`` database, exports ``TEST_RUN_ID`` / ``TEST_DB_NAME`` /
  ``TEST_DATABASE_URL`` and drops ONLY its own DB in a ``finally``. Multiple
  agents may run tests concurrently without sharing or dropping each other's
  databases.
- This module never creates or drops databases. It only connects to the
  launcher-provided run-DB and isolates per-module schemas (``t_<uuid8>``)
  inside it. Module schemas are left in place for launcher-owned run-DBs
  (dropped whole by the launcher) and are dropped only in manual debug mode
  on the shared static DB.
- per-test cleanup via ``HRMS_TEST_ISOLATION``:
  - ``savepoint`` (default) — outer transaction + nested savepoints
    (``join_transaction_mode="create_savepoint"``); fast rollback
  - ``truncate`` — TRUNCATE ... CASCADE (legacy / debug)
  - marker ``@pytest.mark.requires_truncate`` forces TRUNCATE for one test
- with pytest-xdist prefer ``--dist=loadfile`` so all tests of a module
  stay on one worker (compatible with module-scoped schema/engine).

Fallback policy (strict):
- ``TEST_DATABASE_URL`` set → the database name MUST match
  ``^hrms_test_[0-9a-f]{12}$`` (launcher-owned run-DB); anything else is
  refused. Manual serial ``pytest`` without env runs on the static shared
  ``hrms_test`` DB; parallel ``-n`` without the launcher is refused.
"""

from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import date
from typing import AsyncIterator, Awaitable, Callable, Literal

import pytest
import pytest_asyncio
from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401
from app.models.base import Base
from app.models.department import Department
from app.models.employee import Employee
from app.models.order import Order
from app.models.order_type import OrderType
from app.models.position import Position
from app.models.user import User, UserRole
from app.models.vacation import Vacation
from app.models.vacation_period import VacationPeriod

logger = logging.getLogger(__name__)

# Static shared DB used by manual serial pytest without the launcher.
# The launcher always overrides it with a per-run TEST_DATABASE_URL.
DEFAULT_TEST_DATABASE_URL = (
    os.getenv("HRMS_TEST_DATABASE_URL")
    or os.getenv("TEST_DATABASE_URL")
    or "postgresql+asyncpg://hrms_user:hrms_pass@localhost:5436/hrms_test"
)
RUN_DB_PREFIX = "hrms_test_"
RUN_DB_RE = re.compile(r"^hrms_test_[0-9a-f]{12}$")
TEST_SCHEMA_PREFIX = "t_"
IDENT_RE = re.compile(r"^[a-zA-Z0-9_]+$")

IsolationMode = Literal["savepoint", "truncate"]
_VALID_ISOLATION_MODES: frozenset[str] = frozenset({"savepoint", "truncate"})


def _env_isolation_mode() -> IsolationMode:
    """Read HRMS_TEST_ISOLATION (default: savepoint). Invalid values fall back with warning."""
    raw = os.getenv("HRMS_TEST_ISOLATION", "savepoint").strip().lower()
    if raw not in _VALID_ISOLATION_MODES:
        logger.warning(
            "Unknown HRMS_TEST_ISOLATION=%r; expected savepoint|truncate. Using savepoint.",
            raw,
        )
        return "savepoint"
    return raw  # type: ignore[return-value]


def _resolve_isolation_mode(request: pytest.FixtureRequest) -> IsolationMode:
    """Per-test isolation: marker requires_truncate wins over env default."""
    if request.node.get_closest_marker("requires_truncate") is not None:
        return "truncate"
    return _env_isolation_mode()


def _quote_ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _validate_ident(name: str, *, required_prefix: str) -> None:
    if not name.startswith(required_prefix):
        raise RuntimeError(f"Unsafe identifier '{name}': expected prefix '{required_prefix}'.")
    if not IDENT_RE.fullmatch(name):
        raise RuntimeError(f"Unsafe identifier '{name}': only [a-zA-Z0-9_] is allowed.")


def _build_truncate_sql() -> str:
    table_names = ", ".join(_quote_ident(table_name) for table_name in sorted(Base.metadata.tables.keys()))
    return f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"


def _resolve_test_db_url(config: pytest.Config) -> str:
    """Resolve and validate the DB the suite runs against.

    Launcher mode (TEST_DATABASE_URL set) requires a launcher-owned run-DB
    name (hrms_test_<12 hex>). Manual debug mode (no env) allows raw serial
    pytest on the shared static DB, but refuses parallel (-n) runs that would
    race on it.
    """
    raw = os.getenv("TEST_DATABASE_URL") or os.getenv("HRMS_TEST_DATABASE_URL")
    if raw:
        url = make_url(raw)
        db_name = (url.database or "").lower()
        if not RUN_DB_RE.fullmatch(db_name):
            raise RuntimeError(
                f"Unsafe TEST_DATABASE_URL database {url.database!r}: "
                f"expected launcher-owned run-DB matching {RUN_DB_RE.pattern}. "
                "Run through `npm run test:pytest`."
            )
        return url.render_as_string(hide_password=False)

    numprocesses = getattr(config.option, "numprocesses", 0)
    if numprocesses:
        raise RuntimeError(
            "Parallel pytest (-n) without TEST_DATABASE_URL is refused: it "
            "would race on the shared static DB. Run through "
            "`npm run test:pytest` to get an isolated per-run database."
        )
    url = make_url(DEFAULT_TEST_DATABASE_URL)
    db_name = (url.database or "").lower()
    if "hrms_test" not in db_name:
        raise RuntimeError(
            f"Unsafe TEST_DATABASE_URL database {url.database!r}. It must contain 'hrms_test'."
        )
    return url.render_as_string(hide_password=False)


def pytest_sessionstart(session: pytest.Session) -> None:
    """Validate the DB contract before xdist spawns workers.

    Raising here aborts cleanly before any worker touches a database.
    """
    _resolve_test_db_url(session.config)


def pytest_report_header(config: pytest.Config) -> list[str]:
    run_id = os.getenv("TEST_RUN_ID", "unknown")
    db_name = os.getenv("TEST_DB_NAME", "unknown")
    return [
        f"TEST_RUN_ID: {run_id}",
        f"TEST_DB_NAME: {db_name}",
    ]


@pytest.fixture(scope="session")
def test_database_url(pytestconfig: pytest.Config) -> str:
    """URL of the launcher-owned run-DB (or the static shared DB in manual mode)."""
    return _resolve_test_db_url(pytestconfig)


@pytest_asyncio.fixture(scope="module", loop_scope="module", autouse=True)
async def dispose_app_engine_between_modules() -> AsyncIterator[None]:
    """Reset app-global engine pool around each module's event loop.

    pytest-asyncio module-scoped loops close between modules; under xdist a
    worker runs many modules, and pooled connections bound to a closed loop
    break API tests that hit `app.core.database.engine` (e.g. test_users).
    """

    async def _dispose() -> None:
        try:
            from app.core import database as app_database

            await app_database.engine.dispose()
        except Exception as exc:  # noqa: BLE001 — must not fail setup/teardown
            logger.warning("dispose app engine skipped: %s", exc)

    await _dispose()
    yield
    await _dispose()


@pytest.fixture(scope="module")
def module_schema_name() -> str:
    """Unique schema per test module inside the shared run-DB."""
    schema_name = f"{TEST_SCHEMA_PREFIX}{uuid.uuid4().hex[:8]}"
    _validate_ident(schema_name, required_prefix=TEST_SCHEMA_PREFIX)
    return schema_name


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def db_engine(
    test_database_url: str,
    module_schema_name: str,
) -> AsyncIterator[AsyncEngine]:
    """Engine on the launcher-provided run-DB with a fresh schema per module.

    The run-DB is owned by the launcher and is deliberately NOT dropped here:
    dropping it in any single module's teardown would break the parallel
    xdist workers sharing it. The module schema (t_<uuid8>) is also left in
    place for launcher-owned run-DBs: they are dropped whole by the launcher
    (or reaped by `npm run test:db:cleanup` if a run is killed), so a per
    -module DROP SCHEMA CASCADE would only add ~0.25s × module for no gain.
    The module schema is dropped only in manual debug mode on the shared
    static DB, so it does not accumulate there.
    """
    engine = create_async_engine(test_database_url, pool_pre_ping=True, poolclass=NullPool)

    # Every new connection must resolve unqualified tables in the module schema.
    @event.listens_for(engine.sync_engine, "connect")
    def _set_search_path(dbapi_conn, record):  # noqa: ARG001
        cursor = dbapi_conn.cursor()
        cursor.execute(f"SET search_path TO {_quote_ident(module_schema_name)}")
        cursor.close()

    async with engine.begin() as conn:
        await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {_quote_ident(module_schema_name)}"))
        await conn.run_sync(Base.metadata.create_all)

    try:
        yield engine
    finally:
        db_name = (make_url(test_database_url).database or "").lower()
        if not RUN_DB_RE.fullmatch(db_name):
            # Manual debug on the shared static DB — drop the module schema so
            # t_<uuid8> schemas do not accumulate in the persistent DB.
            try:
                async with engine.begin() as conn:
                    await conn.execute(
                        text(f"DROP SCHEMA IF EXISTS {_quote_ident(module_schema_name)} CASCADE")
                    )
            except Exception as exc:  # noqa: BLE001 — schema cleanup must not abort suite
                logger.warning("module schema drop failed: %s", exc)
        await engine.dispose()


@pytest.fixture(scope="module")
def db_session_factory(db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="function", loop_scope="module")
async def db_session(
    request: pytest.FixtureRequest,
    db_engine: AsyncEngine,
    db_session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    """Per-test DB session with dual isolation (savepoint default / truncate).

    Savepoint path: outer transaction + nested savepoints
    (``join_transaction_mode="create_savepoint"``). ``session.commit()`` in a
    test only releases the nested savepoint; outer rollback undoes all writes.
    Teardown is defensive against PendingRollbackError / closed connections.
    """
    mode = _resolve_isolation_mode(request)

    if mode == "truncate":
        async with db_session_factory() as session:
            yield session
            try:
                await session.close()
            except Exception as exc:  # noqa: BLE001 — teardown must not abort suite
                logger.warning("truncate-mode session.close failed: %s", exc)

        try:
            async with db_session_factory() as cleanup_session:
                await cleanup_session.execute(text(_build_truncate_sql()))
                await cleanup_session.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning("TRUNCATE cleanup failed: %s", exc)
        return

    # --- savepoint mode (default) ---
    conn = await db_engine.connect()
    transaction = None
    session: AsyncSession | None = None
    try:
        transaction = await conn.begin()
        session_factory = async_sessionmaker(
            bind=conn,
            class_=AsyncSession,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        session = session_factory()
        yield session
    finally:
        if session is not None:
            try:
                await session.rollback()
            except Exception as exc:  # noqa: BLE001 — PendingRollbackError / closed
                logger.warning("savepoint session.rollback failed: %s", exc)
            try:
                await session.close()
            except Exception as exc:  # noqa: BLE001
                logger.warning("savepoint session.close failed: %s", exc)
        if transaction is not None:
            try:
                await transaction.rollback()
            except Exception as exc:  # noqa: BLE001
                logger.warning("outer transaction.rollback failed: %s", exc)
        try:
            await conn.close()
        except Exception as exc:  # noqa: BLE001
            logger.warning("savepoint connection.close failed: %s", exc)


@pytest.fixture
def create_department(db_session: AsyncSession) -> Callable[..., Awaitable[Department]]:
    async def _create(**overrides) -> Department:
        department = Department(
            name=overrides.pop("name", f"Department-{uuid.uuid4().hex[:8]}"),
            short_name=overrides.pop("short_name", None),
            color=overrides.pop("color", None),
            icon=overrides.pop("icon", None),
            rank=overrides.pop("rank", 1),
            sort_order=overrides.pop("sort_order", 0),
            **overrides,
        )
        db_session.add(department)
        await db_session.flush()
        await db_session.refresh(department)
        return department

    return _create


@pytest.fixture
def create_position(db_session: AsyncSession) -> Callable[..., Awaitable[Position]]:
    async def _create(**overrides) -> Position:
        position = Position(
            name=overrides.pop("name", f"Position-{uuid.uuid4().hex[:8]}"),
            color=overrides.pop("color", None),
            icon=overrides.pop("icon", None),
            sort_order=overrides.pop("sort_order", 0),
            **overrides,
        )
        db_session.add(position)
        await db_session.flush()
        await db_session.refresh(position)
        return position

    return _create


@pytest.fixture
def create_employee(
    db_session: AsyncSession,
    create_department: Callable[..., Awaitable[Department]],
    create_position: Callable[..., Awaitable[Position]],
) -> Callable[..., Awaitable[Employee]]:
    async def _create(**overrides) -> Employee:
        department = overrides.pop("department", None)
        position = overrides.pop("position", None)

        if department is None and "department_id" not in overrides:
            department = await create_department()
        if position is None and "position_id" not in overrides:
            position = await create_position()

        employee = Employee(
            tab_number=overrides.pop("tab_number", int(uuid.uuid4().int % 900000) + 100000),
            name=overrides.pop("name", f"Employee-{uuid.uuid4().hex[:8]}"),
            department_id=overrides.pop("department_id", department.id if department else None),
            position_id=overrides.pop("position_id", position.id if position else None),
            additional_vacation_days=overrides.pop("additional_vacation_days", 0),
            hire_date=overrides.pop("hire_date", date(2024, 1, 15)),
            **overrides,
        )
        db_session.add(employee)
        await db_session.flush()
        await db_session.refresh(employee)
        return employee

    return _create


@pytest.fixture
def create_order_type(db_session: AsyncSession) -> Callable[..., Awaitable[OrderType]]:
    async def _create(**overrides) -> OrderType:
        order_type = OrderType(
            code=overrides.pop("code", f"order_type_{uuid.uuid4().hex[:8]}"),
            name=overrides.pop("name", f"Тип приказа {uuid.uuid4().hex[:6]}"),
            is_active=overrides.pop("is_active", True),
            template_filename=overrides.pop("template_filename", None),
            field_schema=overrides.pop("field_schema", []),
            filename_pattern=overrides.pop("filename_pattern", None),
            **overrides,
        )
        db_session.add(order_type)
        await db_session.flush()
        await db_session.refresh(order_type)
        return order_type

    return _create


@pytest.fixture
def create_order(
    db_session: AsyncSession,
    create_employee: Callable[..., Awaitable[Employee]],
    create_order_type: Callable[..., Awaitable[OrderType]],
) -> Callable[..., Awaitable[Order]]:
    async def _create(**overrides) -> Order:
        employee = overrides.pop("employee", None)
        order_type = overrides.pop("order_type_obj", None)
        if employee is None and "employee_id" not in overrides:
            employee = await create_employee()
        if order_type is None and "order_type_id" not in overrides:
            order_type = await create_order_type()

        order = Order(
            order_number=overrides.pop("order_number", f"{int(uuid.uuid4().int % 90) + 10}"),
            order_type_id=overrides.pop("order_type_id", order_type.id if order_type else None),
            employee_id=overrides.pop("employee_id", employee.id if employee else None),
            order_date=overrides.pop("order_date", date(2026, 4, 1)),
            file_path=overrides.pop("file_path", None),
            notes=overrides.pop("notes", None),
            extra_fields=overrides.pop("extra_fields", None),
            **overrides,
        )
        db_session.add(order)
        await db_session.flush()
        await db_session.refresh(order)
        return order

    return _create


@pytest.fixture
def create_vacation(
    db_session: AsyncSession,
    create_employee: Callable[..., Awaitable[Employee]],
) -> Callable[..., Awaitable[Vacation]]:
    async def _create(**overrides) -> Vacation:
        employee = overrides.pop("employee", None)
        if employee is None and "employee_id" not in overrides:
            employee = await create_employee()

        vacation = Vacation(
            employee_id=overrides.pop("employee_id", employee.id if employee else None),
            start_date=overrides.pop("start_date", date(2026, 4, 1)),
            end_date=overrides.pop("end_date", date(2026, 4, 10)),
            vacation_type=overrides.pop("vacation_type", "Трудовой"),
            days_count=overrides.pop("days_count", 10),
            vacation_year=overrides.pop("vacation_year", 2026),
            comment=overrides.pop("comment", None),
            **overrides,
        )
        db_session.add(vacation)
        await db_session.flush()
        await db_session.refresh(vacation)
        return vacation

    return _create


@pytest.fixture
def create_vacation_period(
    db_session: AsyncSession,
    create_employee: Callable[..., Awaitable[Employee]],
) -> Callable[..., Awaitable[VacationPeriod]]:
    async def _create(**overrides) -> VacationPeriod:
        employee = overrides.pop("employee", None)
        if employee is None and "employee_id" not in overrides:
            employee = await create_employee()

        period = VacationPeriod(
            employee_id=overrides.pop("employee_id", employee.id if employee else None),
            period_start=overrides.pop("period_start", date(2024, 1, 15)),
            period_end=overrides.pop("period_end", date(2025, 1, 14)),
            main_days=overrides.pop("main_days", 24),
            additional_days=overrides.pop("additional_days", 0),
            used_days=overrides.pop("used_days", 0),
            used_days_auto=overrides.pop("used_days_auto", 0),
            used_days_manual=overrides.pop("used_days_manual", 0),
            remaining_days=overrides.pop("remaining_days", None),
            order_ids=overrides.pop("order_ids", None),
            order_numbers=overrides.pop("order_numbers", None),
            order_days_map=overrides.pop("order_days_map", None),
            year_number=overrides.pop("year_number", 1),
            **overrides,
        )
        db_session.add(period)
        await db_session.flush()
        await db_session.refresh(period)
        return period

    return _create


@pytest.fixture
def create_user(db_session: AsyncSession) -> Callable[..., Awaitable[User]]:
    async def _create(**overrides) -> User:
        user = User(
            username=overrides.pop("username", f"user_{uuid.uuid4().hex[:8]}"),
            full_name=overrides.pop("full_name", "Test User"),
            role=overrides.pop("role", UserRole.VIEWER.value),
            **overrides,
        )
        db_session.add(user)
        await db_session.flush()
        await db_session.refresh(user)
        return user

    return _create


@pytest.fixture
async def admin_user(
    db_session: AsyncSession,
    create_user: Callable[..., Awaitable[User]],
) -> User:
    return await create_user(
        username="admin",
        full_name="Admin User",
        role=UserRole.ADMIN.value,
    )
