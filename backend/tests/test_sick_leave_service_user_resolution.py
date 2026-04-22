from datetime import date

import pytest

from app.services.sick_leave_service import sick_leave_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_create_sick_leave_accepts_string_current_user(db_session, create_employee, monkeypatch):
    async def _noop_audit_log(*args, **kwargs):
        return None

    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)

    employee = await create_employee(name="SickLeave User Resolution")

    result = await sick_leave_service.create_sick_leave(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 4, 10),
            "end_date": date(2026, 4, 12),
            "comment": "test",
        },
        "admin",
    )

    assert result["id"] > 0
    assert result["employee_id"] == employee.id
    assert isinstance(result["created_by"], int)
