import pytest

from app.api.departments import DepartmentUpdate, update_department

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_update_department_does_not_crash_on_audit_log_format(db_session, create_department):
    department = await create_department(name="Before")

    response = await update_department(
        dept_id=department.id,
        data=DepartmentUpdate(name="After"),
        db=db_session,
        current_user="admin",
    )

    assert response.id == department.id
    assert response.name == "After"
