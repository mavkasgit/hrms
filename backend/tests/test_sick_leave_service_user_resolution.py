from datetime import date

import pytest

from app.services.sick_leave_service import sick_leave_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _noop_audit_log(*args, **kwargs):
    return None


async def test_create_sick_leave_writes_current_user_string(
    db_session, create_employee, monkeypatch
):
    """Автор пишется строкой из current_user напрямую, без lookup в users (#110).

    Реальная запись в users для автора не требуется.
    """
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
    assert result["created_by"] == "admin"


async def test_create_sick_leave_break_glass_writes_identity_string(
    db_session, create_employee, monkeypatch
):
    """Break-glass (emergency_admin) пишется строкой; 404 не возникает."""
    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)

    employee = await create_employee(name="SickLeave Break Glass")

    result = await sick_leave_service.create_sick_leave(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 4, 10),
            "end_date": date(2026, 4, 12),
            "comment": "test",
        },
        "emergency_admin",
    )

    assert result["id"] > 0
    assert result["created_by"] == "emergency_admin"


async def test_create_sick_leave_unknown_username_no_lookup(
    db_session, create_employee, monkeypatch
):
    """Неизвестный username (опечатка/сервисный аккаунт) не вызывает ошибку:
    автор фиксируется строкой как есть — никакого обращения к users."""
    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)

    employee = await create_employee(name="SickLeave Unknown User")

    result = await sick_leave_service.create_sick_leave(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 4, 10),
            "end_date": date(2026, 4, 12),
            "comment": "test",
        },
        "ghost_user",
    )

    assert result["created_by"] == "ghost_user"


async def test_update_sick_leave_writes_current_user_string(
    db_session, create_employee, monkeypatch
):
    """Update фиксирует updated_by строкой из current_user."""
    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)

    employee = await create_employee(name="SickLeave Update Actor")

    created = await sick_leave_service.create_sick_leave(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 4, 10),
            "end_date": date(2026, 4, 12),
            "comment": "test",
        },
        "emergency_admin",
    )

    updated = await sick_leave_service.update_sick_leave(
        db_session, created["id"], {"comment": "updated"}, "emergency_admin"
    )

    assert updated["comment"] == "updated"
    assert updated["updated_by"] == "emergency_admin"


async def test_delete_sick_leave_writes_current_user_string(
    db_session, create_employee, monkeypatch
):
    """Delete фиксирует deleted_by строкой из current_user."""
    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)

    employee = await create_employee(name="SickLeave Delete Actor")

    created = await sick_leave_service.create_sick_leave(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 4, 10),
            "end_date": date(2026, 4, 12),
            "comment": "test",
        },
        "emergency_admin",
    )

    deleted = await sick_leave_service.delete_sick_leave(
        db_session, created["id"], "emergency_admin"
    )

    assert deleted is True

    from sqlalchemy import select

    from app.models.sick_leave import SickLeave, SickLeaveStatus

    row = (
        await db_session.execute(
            select(SickLeave).where(SickLeave.id == created["id"])
        )
    ).scalars().first()
    assert row is not None
    assert row.status == SickLeaveStatus.DELETED
    assert row.deleted_by == "emergency_admin"
