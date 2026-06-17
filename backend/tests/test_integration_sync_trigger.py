from unittest.mock import patch
import pytest
from datetime import date
from app.services.employee_service import employee_service
from app.schemas.employee import EmployeeCreate, EmployeeUpdate

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_employee_lifecycle_sync_triggers(db_session):
    # 1. Test create employee triggers sync
    create_data = EmployeeCreate(
        tab_number=10101,
        name="Test Sync Emp",
        hire_date=date(2026, 1, 1),
        gender="M",
    )

    with patch("app.services.employee_sync.sync_employee_to_ktm") as mock_sync:
        emp = await employee_service.create_employee(
            db_session, create_data, user_id="admin"
        )

        mock_sync.assert_called_once()
        _, kwargs = mock_sync.call_args
        assert kwargs.get("tab_number") == 10101
        assert kwargs.get("name") == "Test Sync Emp"
        assert kwargs.get("is_deleted") is False

    # 2. Test update employee triggers sync
    update_data = EmployeeUpdate(name="Test Sync Emp Updated")
    with patch("app.services.employee_sync.sync_employee_to_ktm") as mock_sync:
        await employee_service.update_employee(
            db_session, emp.id, update_data, user_id="admin"
        )
        mock_sync.assert_called_once()
        _, kwargs = mock_sync.call_args
        assert kwargs.get("name") == "Test Sync Emp Updated"
        assert kwargs.get("is_deleted") is False

    # 3. Test dismiss employee triggers sync (should set is_deleted=True)
    with patch("app.services.employee_sync.sync_employee_to_ktm") as mock_sync:
        await employee_service.dismiss_employee(
            db_session, emp.id, user_id="admin", reason="Test dismiss"
        )
        mock_sync.assert_called_once()
        _, kwargs = mock_sync.call_args
        assert kwargs.get("is_deleted") is True

    # 4. Test restore employee triggers sync (should set is_deleted=False)
    with patch("app.services.employee_sync.sync_employee_to_ktm") as mock_sync:
        await employee_service.restore_employee(
            db_session, emp.id, user_id="admin"
        )
        mock_sync.assert_called_once()
        _, kwargs = mock_sync.call_args
        assert kwargs.get("is_deleted") is False

    # 5. Test soft delete employee triggers sync (should set is_deleted=True)
    with patch("app.services.employee_sync.sync_employee_to_ktm") as mock_sync:
        await employee_service.soft_delete_employee(
            db_session, emp.id, user_id="admin"
        )
        mock_sync.assert_called_once()
        _, kwargs = mock_sync.call_args
        assert kwargs.get("is_deleted") is True

    # 6. Test hard delete employee triggers sync (should set is_deleted=True)
    # Re-create another employee to hard delete
    another_emp_data = EmployeeCreate(
        tab_number=20202,
        name="Another Test Sync Emp",
        hire_date=date(2026, 1, 1),
        gender="F",
    )
    another_emp = await employee_service.create_employee(
        db_session, another_emp_data, user_id="admin"
    )

    with patch("app.services.employee_sync.sync_employee_to_ktm") as mock_sync:
        await employee_service.hard_delete_employee(
            db_session, another_emp.id, user_id="admin"
        )
        mock_sync.assert_called_once()
        _, kwargs = mock_sync.call_args
        assert kwargs.get("tab_number") == 20202
        assert kwargs.get("is_deleted") is True
