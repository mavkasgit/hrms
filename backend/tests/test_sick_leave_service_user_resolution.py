from datetime import date

import pytest

from app.services.sick_leave_service import sick_leave_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _noop_audit_log(*args, **kwargs):
    return None


async def test_create_sick_leave_resolves_existing_username(
    db_session, create_employee, admin_user, monkeypatch
):
    """Существующий username → created_by = users.id + created_by_identity."""
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
    assert result["created_by_identity"] == "admin"


async def test_create_sick_leave_break_glass_no_user_record(
    db_session, create_employee, monkeypatch
):
    """Break-glass (emergency_admin) без записи в users: 404 не возникает (#110).

    created_by = NULL, provenance — по identity-строке.
    """
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
    assert result["created_by"] is None
    assert result["created_by_identity"] == "emergency_admin"


async def test_update_sick_leave_break_glass_no_user_record(
    db_session, create_employee, monkeypatch
):
    """Update под break-glass: updated_by_identity фиксируется, 404 не возникает."""
    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)

    employee = await create_employee(name="SickLeave Break Glass Update")

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
    assert updated["updated_by"] is None
    assert updated["updated_by_identity"] == "emergency_admin"


async def test_update_sick_leave_break_glass_clears_stale_updated_by(
    db_session, create_employee, admin_user, monkeypatch
):
    """Mixed-provenance: break-glass обновляет запись, ранее тронутую реальным
    пользователем — updated_by обнуляется (FK на users не актуален), а identity
    фиксирует фактического автора изменения."""
    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)

    employee = await create_employee(name="SickLeave Mixed Provenance")

    created = await sick_leave_service.create_sick_leave(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 4, 10),
            "end_date": date(2026, 4, 12),
            "comment": "test",
        },
        "admin",
    )
    assert created["created_by"] == admin_user.id

    updated = await sick_leave_service.update_sick_leave(
        db_session, created["id"], {"comment": "by break-glass"}, "emergency_admin"
    )

    assert updated["comment"] == "by break-glass"
    assert updated["updated_by"] is None
    assert updated["updated_by_identity"] == "emergency_admin"


async def test_delete_sick_leave_break_glass_no_user_record(
    db_session, create_employee, monkeypatch
):
    """Delete под break-glass: deleted_by_identity фиксируется, 404 не возникает."""
    monkeypatch.setattr("app.services.sick_leave_service.audit_logger.log", _noop_audit_log)

    employee = await create_employee(name="SickLeave Break Glass Delete")

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

    from app.models.sick_leave import SickLeave

    row = (
        await db_session.execute(
            select(SickLeave).where(SickLeave.id == created["id"])
        )
    ).scalars().first()
    assert row is not None
    assert row.status.value == "deleted"
    assert row.deleted_by is None
    assert row.deleted_by_identity == "emergency_admin"
