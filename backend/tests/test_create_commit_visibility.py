"""Регрессия: create-эндпоинты обязаны коммитить до возврата ответа.

Баг: create_department / create_position / create_employee не делали
`db.commit()` и полагались на teardown get_db, который коммитит уже после
отправки ответа. Под нагрузкой между ответом 200 и фактическим commit
другой запрос (например POST /api/employees с department_id) не видел ещё
не закоммиченную строку → FK violation.

Тест: создание через endpoint, затем проверка видимости строки из
**отдельного** соединения. В truncate-изоляции отдельное соединение не видит
незакоммиченные данные — если endpoint не коммитит, свежая сессия вернёт None.
"""

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.departments import DepartmentCreate, create_department
from app.api.positions import PositionCreate, create_position
from app.models.department import Department
from app.models.employee import Employee
from app.models.position import Position
from app.schemas.employee import EmployeeCreate
from app.services.employee_service import employee_service

pytestmark = [pytest.mark.asyncio(loop_scope="module"), pytest.mark.requires_truncate]


async def _visible_in_fresh_session(
    db_session_factory: async_sessionmaker[AsyncSession],
    model,
    obj_id: int,
) -> bool:
    """Проверяет видимость строки из отдельного соединения (после commit)."""
    async with db_session_factory() as fresh:
        row = await fresh.get(model, obj_id)
    return row is not None


async def test_create_department_commits_before_return(
    db_session: AsyncSession,
    db_session_factory: async_sessionmaker[AsyncSession],
):
    dept = await create_department(
        DepartmentCreate(name=f"Dept-{uuid.uuid4().hex[:8]}"),
        db=db_session,
        current_user="tester",
    )
    assert await _visible_in_fresh_session(db_session_factory, Department, dept.id)


async def test_create_position_commits_before_return(
    db_session: AsyncSession,
    db_session_factory: async_sessionmaker[AsyncSession],
):
    pos = await create_position(
        PositionCreate(name=f"Pos-{uuid.uuid4().hex[:8]}"),
        db=db_session,
        current_user="tester",
    )
    assert await _visible_in_fresh_session(db_session_factory, Position, pos.id)


async def test_create_employee_commits_before_return(
    db_session: AsyncSession,
    db_session_factory: async_sessionmaker[AsyncSession],
):
    dept = await create_department(
        DepartmentCreate(name=f"Dept-{uuid.uuid4().hex[:8]}"),
        db=db_session,
        current_user="tester",
    )
    pos = await create_position(
        PositionCreate(name=f"Pos-{uuid.uuid4().hex[:8]}"),
        db=db_session,
        current_user="tester",
    )
    employee = await employee_service.create_employee(
        db_session,
        EmployeeCreate(
            name=f"Emp-{uuid.uuid4().hex[:8]}",
            tab_number=int(uuid.uuid4().int % 900000) + 100000,
            department_id=dept.id,
            position_id=pos.id,
        ),
        "tester",
    )
    assert await _visible_in_fresh_session(db_session_factory, Employee, employee.id)
