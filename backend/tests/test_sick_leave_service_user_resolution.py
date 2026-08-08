from datetime import date

import pytest

from app.core.exceptions import UserNotFoundError
from app.services.sick_leave_service import sick_leave_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _noop_audit_log(*args, **kwargs):
    return None


async def test_create_sick_leave_resolves_existing_username(
    db_session, create_employee, admin_user, monkeypatch
):
    """Автор записи резолвится по существующему username, а не создаётся заново."""
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
    assert result["created_by"] == admin_user.id
    assert isinstance(result["created_by"], int)


async def test_create_sick_leave_missing_username_raises_not_found(
    db_session, create_employee, monkeypatch
):
    """Неизвестный username → NotFoundError (JIT-провижининг не выполняется)."""
    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)

    employee = await create_employee(name="SickLeave No User")

    with pytest.raises(UserNotFoundError):
        await sick_leave_service.create_sick_leave(
            db_session,
            {
                "employee_id": employee.id,
                "start_date": date(2026, 4, 10),
                "end_date": date(2026, 4, 12),
                "comment": "test",
            },
            "ghost_user",
        )
