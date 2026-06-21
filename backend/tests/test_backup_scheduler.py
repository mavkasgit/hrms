import pytest
from datetime import datetime, date
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy import text

from app.services.backup_scheduler import (
    determine_backup_type,
    rotate_backups,
    run_backup_cycle,
    BACKUP_SCHEDULER_LOCK_ID,
)
from app.core.config import settings

def test_determine_backup_type():
    # 1st of the month -> monthly
    assert determine_backup_type(datetime(2026, 6, 1, 2, 0)) == "monthly"
    
    # Sunday but not 1st -> weekly (2026-06-07 is Sunday)
    assert determine_backup_type(datetime(2026, 6, 7, 2, 0)) == "weekly"
    
    # Monday -> daily (2026-06-08 is Monday)
    assert determine_backup_type(datetime(2026, 6, 8, 2, 0)) == "daily"


def test_rotate_backups(monkeypatch):
    deleted_files = []
    
    # Mock files
    mock_files = [
        MagicMock(name=f"daily_{i}") for i in range(15)
    ] + [
        MagicMock(name=f"weekly_{i}") for i in range(10)
    ] + [
        MagicMock(name=f"monthly_{i}") for i in range(5)
    ] + [
        MagicMock(name=f"manual_{i}") for i in range(5)
    ]
    
    # Setup filenames and metadata mocking
    for idx, f in enumerate(mock_files):
        if idx < 15:
            f.name = f"backup_db_daily_{idx}.zip"
        elif idx < 25:
            f.name = f"backup_db_weekly_{idx}.zip"
        elif idx < 30:
            f.name = f"backup_db_monthly_{idx}.zip"
        else:
            f.name = f"backup_db_manual_{idx}.zip"
            
        f.stat.return_value.st_mtime = 1000 - idx  # Sort order helper
    
    # Mock functions imported in backup_scheduler
    monkeypatch.setattr("app.services.backup_scheduler._iter_backup_files", lambda: mock_files)
    monkeypatch.setattr("app.services.backup_scheduler._read_backup_meta", lambda name: {
        "backup_type": "daily" if "daily" in name else ("weekly" if "weekly" in name else ("monthly" if "monthly" in name else "manual"))
    })
    monkeypatch.setattr("app.services.backup_scheduler._delete_backup_file", lambda name: deleted_files.append(name))
    
    # Run rotation
    rotate_backups()
    
    # We had 15 daily. GFS keeps 7 daily -> 8 daily should be deleted.
    # We had 10 weekly. GFS keeps 4 weekly -> 6 weekly should be deleted.
    # We had 5 monthly and 5 manual -> 0 should be deleted.
    deleted_daily = [name for name in deleted_files if "daily" in name]
    deleted_weekly = [name for name in deleted_files if "weekly" in name]
    deleted_others = [name for name in deleted_files if "monthly" in name or "manual" in name]
    
    assert len(deleted_daily) == 8
    assert len(deleted_weekly) == 6
    assert len(deleted_others) == 0


@pytest.mark.asyncio
async def test_run_backup_cycle_skips_when_already_run_today(monkeypatch):
    # Mock files: last backup was created today
    mock_file = MagicMock()
    mock_file.name = "backup_db_2026-06-21.zip"
    mock_file.stat.return_value.st_mtime = datetime.now().timestamp()
    
    monkeypatch.setattr("app.services.backup_scheduler._iter_backup_files", lambda: [mock_file])
    monkeypatch.setattr("app.services.backup_scheduler._read_config_json", lambda: {
        "auto_enabled": True,
        "time_of_day": datetime.now().strftime("%H:%M")
    })
    
    # Verify _create_backup_archive is not called
    backup_mock = MagicMock()
    monkeypatch.setattr("app.services.backup_scheduler._create_backup_archive", backup_mock)
    
    await run_backup_cycle()
    
    backup_mock.assert_not_called()


class MockAsyncContextManager:
    def __init__(self, value):
        self.value = value
    async def __aenter__(self):
        return self.value
    async def __aexit__(self, exc_type, exc, tb):
        pass


@pytest.mark.asyncio
async def test_run_backup_cycle_lock_acquisition_failure(monkeypatch):
    # Mock no backups today
    monkeypatch.setattr("app.services.backup_scheduler._iter_backup_files", lambda: [])
    monkeypatch.setattr("app.services.backup_scheduler._read_config_json", lambda: {
        "auto_enabled": True,
        "time_of_day": datetime.now().strftime("%H:%M")
    })
    
    import app.services.backup_scheduler
    
    # Create mock session and engine
    mock_session = AsyncMock()
    mock_session.begin = MagicMock(return_value=MockAsyncContextManager(mock_session))
    
    # Mock execute result
    execute_result = MagicMock()
    execute_result.scalar.return_value = False
    mock_session.execute.return_value = execute_result
    
    # Mock async_session maker to return our mock context manager
    session_maker_mock = MagicMock(return_value=MockAsyncContextManager(mock_session))
    monkeypatch.setattr(app.services.backup_scheduler, "async_session", session_maker_mock)
    
    backup_mock = MagicMock()
    monkeypatch.setattr("app.services.backup_scheduler._create_backup_archive", backup_mock)
    
    await run_backup_cycle()
    
    # Should attempt execution with correct lock ID
    mock_session.execute.assert_called_once()
    assert mock_session.execute.call_args[0][0].text == "SELECT pg_try_advisory_xact_lock(:id)"
    assert mock_session.execute.call_args[0][1]["id"] == BACKUP_SCHEDULER_LOCK_ID
    
    # Should NOT call backup function
    backup_mock.assert_not_called()


@pytest.mark.asyncio
async def test_run_backup_cycle_success(monkeypatch):
    monkeypatch.setattr("app.services.backup_scheduler._iter_backup_files", lambda: [])
    monkeypatch.setattr("app.services.backup_scheduler._read_config_json", lambda: {
        "auto_enabled": True,
        "time_of_day": datetime.now().strftime("%H:%M")
    })
    
    import app.services.backup_scheduler
    
    # Setup mock session returning True for lock
    mock_session = AsyncMock()
    mock_session.begin = MagicMock(return_value=MockAsyncContextManager(mock_session))
    
    execute_result = MagicMock()
    execute_result.scalar.return_value = True
    mock_session.execute.return_value = execute_result
    
    session_maker_mock = MagicMock(return_value=MockAsyncContextManager(mock_session))
    monkeypatch.setattr(app.services.backup_scheduler, "async_session", session_maker_mock)
    
    # Mock backup archive creation and GFS rotation
    backup_mock = MagicMock()
    backup_mock.return_value = {"filename": "test.zip"}
    monkeypatch.setattr("app.services.backup_scheduler._create_backup_archive", backup_mock)
    
    rotate_mock = MagicMock()
    monkeypatch.setattr("app.services.backup_scheduler.rotate_backups", rotate_mock)
    
    await run_backup_cycle()
    
    # Should call execute, backup and rotate
    mock_session.execute.assert_called_once()
    backup_mock.assert_called_once()
    rotate_mock.assert_called_once()
