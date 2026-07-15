"""Self-check: function-scoped TRUNCATE isolates tests within a module DB."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select, text

from app.models.department import Department

pytestmark = pytest.mark.asyncio(loop_scope="module")

_ISOLATION_MARKER_NAME = f"IsolationDept-{uuid.uuid4().hex}"


async def test_isolation_creates_department(db_session, create_department, test_database_url):
    """Создаёт department с уникальным именем; module DB должна быть hrms_test_*."""
    assert "hrms_test_" in test_database_url

    department = await create_department(name=_ISOLATION_MARKER_NAME)
    await db_session.commit()

    result = await db_session.execute(
        select(Department).where(Department.name == _ISOLATION_MARKER_NAME)
    )
    found = result.scalars().first()
    assert found is not None
    assert found.id == department.id


async def test_isolation_previous_department_is_gone(db_session, test_database_url):
    """После TRUNCATE предыдущего теста marker-department не виден."""
    assert "hrms_test_" in test_database_url

    result = await db_session.execute(
        select(Department).where(Department.name == _ISOLATION_MARKER_NAME)
    )
    assert result.scalars().first() is None

    count_result = await db_session.execute(select(func.count()).select_from(Department))
    assert int(count_result.scalar_one()) == 0

    # sanity: session still works on the module DB
    await db_session.execute(text("SELECT 1"))
