from __future__ import annotations

import uuid
from datetime import date
from typing import AsyncIterator, Callable

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401
from app.models.base import Base
from app.models.department import Department
from app.models.employee import Employee
from app.models.order import Order
from app.models.position import Position
from app.models.vacation import Vacation
from app.models.vacation_period import VacationPeriod


DEFAULT_TEST_DATABASE_URL = "postgresql+asyncpg://hrms_user:hrms_pass@localhost:5432/hrms_test"


def _quote_ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _build_truncate_sql() -> str:
    table_names = ", ".join(
        _quote_ident(table_name) for table_name in sorted(Base.metadata.tables.keys())
    )
    return f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def test_database_url(request) -> AsyncIterator[str]:
    base_url = make_url(DEFAULT_TEST_DATABASE_URL)
    db_name = f"hrms_test_{request.module.__name__.split('.')[-1]}_{uuid.uuid4().hex[:8]}"
    test_url = base_url.set(database=db_name)
    admin_url = base_url.set(database="postgres")

    admin_engine = create_async_engine(
        admin_url.render_as_string(hide_password=False),
        isolation_level="AUTOCOMMIT",
        poolclass=NullPool,
    )

    async with admin_engine.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS {_quote_ident(db_name)} WITH (FORCE)"))
        await conn.execute(text(f"CREATE DATABASE {_quote_ident(db_name)}"))

    await admin_engine.dispose()

    try:
        yield test_url.render_as_string(hide_password=False)
    finally:
        admin_engine = create_async_engine(
            admin_url.render_as_string(hide_password=False),
            isolation_level="AUTOCOMMIT",
            poolclass=NullPool,
        )
        async with admin_engine.connect() as conn:
            await conn.execute(text(f"DROP DATABASE IF EXISTS {_quote_ident(db_name)} WITH (FORCE)"))
        await admin_engine.dispose()


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def db_engine(test_database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(test_database_url, pool_pre_ping=True, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture(scope="module")
def db_session_factory(db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(loop_scope="module")
async def db_session(db_session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with db_session_factory() as session:
        yield session
        await session.close()

    async with db_session_factory() as cleanup_session:
        await cleanup_session.execute(text(_build_truncate_sql()))
        await cleanup_session.commit()


@pytest.fixture
def create_department(db_session: AsyncSession) -> Callable[..., Department]:
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
def create_position(db_session: AsyncSession) -> Callable[..., Position]:
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
    create_department: Callable[..., Department],
    create_position: Callable[..., Position],
) -> Callable[..., Employee]:
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
            contract_start=overrides.pop("contract_start", date(2024, 1, 15)),
            hire_date=overrides.pop("hire_date", date(2024, 1, 15)),
            **overrides,
        )
        db_session.add(employee)
        await db_session.flush()
        await db_session.refresh(employee)
        return employee

    return _create


@pytest.fixture
def create_order(
    db_session: AsyncSession,
    create_employee: Callable[..., Employee],
) -> Callable[..., Order]:
    async def _create(**overrides) -> Order:
        employee = overrides.pop("employee", None)
        if employee is None and "employee_id" not in overrides:
            employee = await create_employee()

        order = Order(
            order_number=overrides.pop("order_number", f"{int(uuid.uuid4().int % 90) + 10}"),
            order_type=overrides.pop("order_type", "Отпуск трудовой"),
            employee_id=overrides.pop("employee_id", employee.id if employee else None),
            order_date=overrides.pop("order_date", date(2026, 4, 1)),
            file_path=overrides.pop("file_path", None),
            notes=overrides.pop("notes", None),
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
    create_employee: Callable[..., Employee],
) -> Callable[..., Vacation]:
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
            order_id=overrides.pop("order_id", None),
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
    create_employee: Callable[..., Employee],
) -> Callable[..., VacationPeriod]:
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
