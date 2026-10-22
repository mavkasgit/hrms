import json
import subprocess

import pytest

from app.api import backups
from app.core.config import settings
from app.services import backup_remote as remote
from app.services.backup_retention import normalize_limits, plan_rotation, plan_rotation_with_limits
from app.services.backup_remote import RemoteBackupError


# ---------------------------------------------------------------------------
# Разбор адресов
# ---------------------------------------------------------------------------


def test_parse_unc_path():
    dest = remote.parse_destination(r"\\nas\backup\hrms")
    assert dest.backend == "smb"
    assert dest.host == "nas"
    assert dest.share_path == "backup/hrms"


def test_parse_smb_url():
    dest = remote.parse_destination("smb://nas/backup/hrms")
    assert (dest.backend, dest.host, dest.share_path) == ("smb", "nas", "backup/hrms")


def test_parse_sftp_url_with_port():
    dest = remote.parse_destination("sftp://backup-host:2222/backups/hrms")
    assert dest.backend == "sftp"
    assert dest.host == "backup-host"
    assert dest.port == 2222
    assert dest.share_path == "/backups/hrms"


@pytest.mark.parametrize(
    ("address", "backend"),
    [
        ("ftp://backup-host/hrms", "ftp"),
        ("ftps://backup-host/hrms", "ftps"),
        ("webdav://cloud/remote.php/dav/backup/hrms", "webdav"),
        ("nfs://nas/export/backups/hrms", "nfs"),
    ],
)
def test_parse_supported_schemes(address, backend):
    assert remote.parse_destination(address).backend == backend


def test_parse_local_paths():
    windows = remote.parse_destination(r"D:\Backup\HRMS")
    assert windows.backend == "local"
    assert windows.local_path == r"D:\Backup\HRMS"

    posix = remote.parse_destination("/mnt/usb/hrms")
    assert posix.backend == "local"
    assert posix.local_path == "/mnt/usb/hrms"


def test_parse_raw_rclone_remote():
    dest = remote.parse_destination("myremote:backup/hrms")
    assert dest.backend == "raw"
    assert dest.raw_spec == "myremote:backup/hrms"


def test_parse_unknown_address_rejected():
    with pytest.raises(RemoteBackupError):
        remote.parse_destination("просто текст")


def test_parse_invalid_port_rejected():
    with pytest.raises(RemoteBackupError, match="порт"):
        remote.parse_destination("sftp://backup-host:notaport/path")


# ---------------------------------------------------------------------------
# Строка подключения и секреты
# ---------------------------------------------------------------------------


def test_build_target_uses_credentials():
    token = remote.encrypt_secret("s3cr3t")
    cfg = remote.build_runtime(
        {
            "enabled": True,
            "destination": "smb://nas/backup/hrms",
            "auth_mode": "credentials",
            "username": "backup",
            "domain": "CORP",
            "password_enc": token,
        }
    )
    target = remote.build_target(cfg)
    assert "host='nas'" in target
    assert "user='backup'" in target
    assert "pass='s3cr3t'" in target
    assert "domain='CORP'" in target


def test_build_target_guest_has_no_password():
    cfg = remote.build_runtime({"enabled": True, "destination": "smb://nas/backup/hrms", "auth_mode": "guest"})
    target = remote.build_target(cfg)
    assert "pass=" not in target
    # rclone не поддерживает анонимный SMB: гостевой доступ — это user=guest.
    assert "user='guest'" in target


def test_build_target_keeps_domain_in_guest_mode():
    cfg = remote.build_runtime({
        "enabled": True,
        "destination": "smb://nas/backup/hrms",
        "auth_mode": "guest",
        "domain": "CORP",
    })
    assert "domain='CORP'" in remote.build_target(cfg)


def test_sftp_guest_mode_requires_account():
    cfg = remote.build_runtime({"enabled": True, "destination": "sftp://host/backups", "auth_mode": "guest"})
    with pytest.raises(RemoteBackupError, match="SFTP"):
        remote.build_target(cfg)


def test_build_target_webdav_anonymous_has_no_user():
    cfg = remote.build_runtime(
        {"enabled": True, "destination": "webdav://cloud/backup/hrms", "auth_mode": "guest"}
    )
    target = remote.build_target(cfg)
    assert "user=" not in target
    assert "pass=" not in target


def test_scrub_secrets_removes_password_from_errors():
    message = ":smb,host='nas',user='backup',pass='s3cr3t':backup/hrms: logon failure"
    scrubbed = remote.scrub_secrets(message)
    assert "s3cr3t" not in scrubbed
    assert "pass=***" in scrubbed


def test_missing_rclone_binary_has_friendly_error(monkeypatch):
    def boom(*args, **kwargs):
        raise FileNotFoundError("rclone")

    monkeypatch.setattr(remote.subprocess, "run", boom)
    monkeypatch.setattr(remote.subprocess, "Popen", boom)

    with pytest.raises(RemoteBackupError, match="rclone не установлен"):
        remote._run(["lsf", "nas:backup"])
    with pytest.raises(RemoteBackupError, match="rclone не установлен"):
        remote._run_with_progress(["copyto", "a", "b"], None)


# ---------------------------------------------------------------------------
# Шифрование пароля
# ---------------------------------------------------------------------------


def test_encrypt_decrypt_roundtrip():
    token = remote.encrypt_secret("пароль")
    assert token and token != "пароль"
    assert remote.decrypt_secret(token) == "пароль"


def test_decrypt_after_secret_key_change_raises(monkeypatch):
    token = remote.encrypt_secret("пароль")
    monkeypatch.setattr(settings, "SECRET_KEY", "another-secret-key")
    with pytest.raises(RemoteBackupError, match="SECRET_KEY"):
        remote.decrypt_secret(token)


def test_apply_update_keeps_clears_and_hides_password():
    saved = remote.apply_update(
        None,
        {
            "enabled": True,
            "destination": "smb://nas/backup/hrms",
            "auth_mode": "credentials",
            "username": "backup",
            "password": "сложный пароль",
        },
    )
    assert saved["password_enc"]
    assert "сложный пароль" not in json.dumps(saved, ensure_ascii=False)

    public = remote.public_config(saved)
    assert "password_enc" not in public
    assert public["has_password"] is True

    kept = remote.apply_update(saved, {"username": "other"})
    assert kept["password_enc"] == saved["password_enc"]

    cleared = remote.apply_update(saved, {"password": ""})
    assert cleared["password_enc"] == ""


def test_apply_update_validates_destination_and_mode():
    with pytest.raises(RemoteBackupError):
        remote.apply_update(None, {"enabled": True, "destination": ""})
    with pytest.raises(RemoteBackupError):
        remote.apply_update(None, {"enabled": True, "destination": "smb://nas/share", "auth_mode": "unknown"})
    with pytest.raises(RemoteBackupError):
        remote.apply_update(
            None,
            {
                "enabled": True,
                "destination": "smb://nas/share",
                "auth_mode": "credentials",
                "username": "",
            },
        )


def test_apply_update_keeps_password_when_switching_to_guest():
    """Пароль очищается только явно: пустой строкой, а не сменой режима."""
    saved = remote.apply_update(
        None,
        {
            "enabled": True,
            "destination": "smb://nas/share",
            "auth_mode": "credentials",
            "username": "backup",
            "password": "секрет",
        },
    )
    switched = remote.apply_update(saved, {"auth_mode": "guest"})
    assert switched["password_enc"] == saved["password_enc"]
    assert remote.decrypt_secret(switched["password_enc"]) == "секрет"


# ---------------------------------------------------------------------------
# GFS-ротация
# ---------------------------------------------------------------------------


def _rotation_entries() -> list[tuple[str, str]]:
    return (
        [(f"daily_{i}.zip", "daily") for i in range(10)]
        + [(f"weekly_{i}.zip", "weekly") for i in range(6)]
        + [(f"monthly_{i}.zip", "monthly") for i in range(3)]
        + [(f"manual_{i}.zip", "manual") for i in range(2)]
    )


def test_plan_rotation_keeps_gfs_policy():
    deleted = plan_rotation(_rotation_entries())
    assert deleted == [f"daily_{i}.zip" for i in range(7, 10)] + [f"weekly_{i}.zip" for i in range(4, 6)]


def test_plan_rotation_with_custom_limits():
    deleted = plan_rotation_with_limits(_rotation_entries(), {"daily": 2, "weekly": 0})
    assert deleted == [f"daily_{i}.zip" for i in range(2, 10)]


def test_normalize_limits_treats_negative_as_unlimited():
    limits = normalize_limits({"daily": -1, "weekly": "3", "monthly": "мусор"})
    assert limits["daily"] == 0
    assert limits["weekly"] == 3
    assert limits["monthly"] == 0


# ---------------------------------------------------------------------------
# Отказоустойчивость: внешняя копия не ломает локальный бэкап
# ---------------------------------------------------------------------------


def test_remote_failure_is_reported_without_raising(monkeypatch, tmp_path):
    saved_status: dict = {}
    monkeypatch.setattr(backups, "_read_config_json", lambda: {"remote": {"enabled": True}})
    monkeypatch.setattr(backups.backup_remote, "is_enabled", lambda raw: True)
    monkeypatch.setattr(
        backups.backup_remote,
        "upload_backup",
        lambda *args, **kwargs: (_ for _ in ()).throw(RemoteBackupError("Нет доступа к внешнему диску")),
    )
    monkeypatch.setattr(backups.backup_remote, "write_status", lambda payload: saved_status.update(payload))

    archive = tmp_path / "backup_db_2026-01-01_00-00-00.zip"
    archive.write_bytes(b"zip")

    status = backups._upload_remote_copy(archive.name, archive)

    assert status is not None
    assert status["ok"] is False
    assert "Нет доступа" in status["error"]
    assert saved_status["ok"] is False
    assert saved_status["filename"] == archive.name


def test_remote_success_writes_status(monkeypatch, tmp_path):
    saved_status: dict = {}
    monkeypatch.setattr(backups, "_read_config_json", lambda: {"remote": {"enabled": True}})
    monkeypatch.setattr(backups.backup_remote, "is_enabled", lambda raw: True)
    monkeypatch.setattr(
        backups.backup_remote,
        "upload_backup",
        lambda *args, **kwargs: {"remote_path": "nas:backup/hrms/backup.zip", "size": 3, "deleted": ["old.zip"]},
    )
    monkeypatch.setattr(backups.backup_remote, "write_status", lambda payload: saved_status.update(payload))

    archive = tmp_path / "backup.zip"
    archive.write_bytes(b"zip")

    status = backups._upload_remote_copy(archive.name, archive)

    assert status is not None and status["ok"] is True
    assert status["remote_path"] == "nas:backup/hrms/backup.zip"
    assert status["deleted"] == ["old.zip"]
    assert saved_status["ok"] is True


def test_remote_disabled_is_noop(monkeypatch, tmp_path):
    monkeypatch.setattr(backups, "_read_config_json", lambda: {"remote": {"enabled": False}})
    assert backups._upload_remote_copy("backup.zip", tmp_path / "backup.zip") is None


# ---------------------------------------------------------------------------
# Проверка адреса и копирование
# ---------------------------------------------------------------------------


def _completed(returncode: int = 0, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args=["rclone"], returncode=returncode, stdout=stdout, stderr=stderr)


def test_test_destination_checks_read_write_and_delete(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(args, timeout=None):
        calls.append(list(args))
        if args[0] == "lsf":
            return _completed(stdout="old.zip\n")
        return _completed()

    monkeypatch.setattr(remote, "_run", fake_run)

    result = remote.test_destination({"enabled": True, "destination": "smb://nas/backup/hrms"})

    assert result["ok"] is True
    assert result["files"] == 1
    assert [args[0] for args in calls] == ["lsf", "copyto", "deletefile"]


def test_test_destination_reports_delete_failure(monkeypatch):
    def fake_run(args, timeout=None):
        if args[0] == "deletefile":
            return _completed(returncode=1, stderr="directory not found")
        return _completed()

    monkeypatch.setattr(remote, "_run", fake_run)

    with pytest.raises(RemoteBackupError, match="удален"):
        remote.test_destination({"enabled": True, "destination": "smb://nas/backup/hrms"})


def test_upload_backup_rotation_failure_does_not_fail_copy(monkeypatch, tmp_path):
    archive = tmp_path / "backup_db_2026-01-01_00-00-00.zip"
    archive.write_bytes(b"zip")

    monkeypatch.setattr(remote, "_run_with_progress", lambda args, progress: None)
    monkeypatch.setattr(remote, "_verify_size", lambda remote_file, size: None)
    monkeypatch.setattr(
        remote,
        "rotate",
        lambda cfg: (_ for _ in ()).throw(RemoteBackupError("нет доступа к списку копий")),
    )

    result = remote.upload_backup(
        archive,
        {"enabled": True, "destination": str(tmp_path), "auth_mode": "guest"},
    )

    assert result["size"] == 3
    assert result["deleted"] == []
    assert "нет доступа" in result["rotation_error"]
