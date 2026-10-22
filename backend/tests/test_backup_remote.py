import json
import subprocess
from datetime import datetime, timezone

import pytest

from app.core.config import settings
from app.services import backup_remote as remote
from app.services.backup_retention import normalize_limits, plan_rotation_with_limits
from app.services.backup_remote import RemoteBackupError, RemoteConfigError


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
    with pytest.raises(RemoteConfigError, match="SFTP"):
        remote.build_runtime({"enabled": True, "destination": "sftp://host/backups", "auth_mode": "guest"})


def test_sftp_guest_mode_accepts_credentials_in_url():
    cfg = remote.build_runtime(
        {"enabled": True, "destination": "sftp://backup:s3cr3t@host/backups", "auth_mode": "guest"}
    )
    target = remote.build_target(cfg)
    assert "user='backup'" in target
    assert "pass='s3cr3t'" in target
    assert cfg.target.display == "sftp://host/backups"


def test_credentials_mode_rejected_for_nfs_and_raw_remote():
    with pytest.raises(RemoteConfigError, match="NFS"):
        remote.build_runtime(
            {
                "enabled": True,
                "destination": "nfs://nas/export/hrms",
                "auth_mode": "credentials",
                "username": "backup",
            }
        )
    with pytest.raises(RemoteConfigError, match="rclone.conf"):
        remote.build_runtime(
            {
                "enabled": True,
                "destination": "nas:backup/hrms",
                "auth_mode": "credentials",
                "username": "backup",
            }
        )


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
    deleted = plan_rotation_with_limits(_rotation_entries(), None)
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


def _archive(tmp_path) -> "object":
    path = tmp_path / "backup_db_2026-01-01_00-00-00.zip"
    path.write_bytes(b"zip")
    return path


def test_remote_failure_is_reported_without_raising(monkeypatch, tmp_path):
    saved_status: dict = {}
    monkeypatch.setattr(
        remote,
        "upload_backup",
        lambda *args, **kwargs: (_ for _ in ()).throw(RemoteBackupError("Нет доступа к внешнему диску")),
    )
    monkeypatch.setattr(remote, "write_status", lambda payload: saved_status.update(payload))

    status = remote.upload_with_status(_archive(tmp_path), {"destination": str(tmp_path)})

    assert status is not None
    assert status["ok"] is False
    assert status["error_kind"] == "storage"
    assert "Нет доступа" in status["error"]
    assert saved_status["ok"] is False
    assert saved_status["filename"] == "backup_db_2026-01-01_00-00-00.zip"


def test_remote_config_error_is_typed_for_http_status(monkeypatch, tmp_path):
    monkeypatch.setattr(
        remote,
        "upload_backup",
        lambda *args, **kwargs: (_ for _ in ()).throw(RemoteConfigError("Введите пароль заново")),
    )
    monkeypatch.setattr(remote, "write_status", lambda payload: None)

    status = remote.upload_with_status(_archive(tmp_path), {"destination": str(tmp_path)})

    assert status is not None and status["ok"] is False
    assert status["error_kind"] == "config"


def test_remote_success_writes_status(monkeypatch, tmp_path):
    saved_status: dict = {}
    monkeypatch.setattr(
        remote,
        "upload_backup",
        lambda *args, **kwargs: {"remote_path": "nas:backup/hrms/backup.zip", "size": 3, "deleted": ["old.zip"]},
    )
    monkeypatch.setattr(remote, "write_status", lambda payload: saved_status.update(payload))

    archive = _archive(tmp_path)
    status = remote.upload_with_status(archive, {"destination": str(tmp_path)})

    assert status is not None and status["ok"] is True
    assert status["remote_path"] == "nas:backup/hrms/backup.zip"
    assert status["deleted"] == ["old.zip"]
    assert saved_status["ok"] is True


def test_remote_not_configured_is_noop(monkeypatch, tmp_path):
    monkeypatch.setattr(
        remote,
        "upload_backup",
        lambda *args, **kwargs: pytest.fail("копирование не должно запускаться"),
    )
    assert remote.upload_with_status(tmp_path / "backup.zip", {"enabled": False}) is None


def test_manual_upload_works_when_auto_copy_disabled(monkeypatch, tmp_path):
    """Ручная копия нужна и при выключенной автокопии — достаточно адреса."""
    monkeypatch.setattr(remote, "_run_with_progress", lambda args, progress: None)
    monkeypatch.setattr(remote, "_verify_size", lambda remote_file, size: None)
    monkeypatch.setattr(remote, "rotate", lambda cfg: [])

    result = remote.upload_backup(
        _archive(tmp_path),
        {"enabled": False, "destination": str(tmp_path / "remote")},
    )

    assert result["size"] == 3


def test_remote_path_does_not_leak_password(monkeypatch, tmp_path):
    """Пароль из URL/строки rclone не должен попадать в статус и UI."""
    monkeypatch.setattr(remote, "_run_with_progress", lambda args, progress: None)
    monkeypatch.setattr(remote, "_verify_size", lambda remote_file, size: None)
    monkeypatch.setattr(remote, "rotate", lambda cfg: [])

    result = remote.upload_backup(
        _archive(tmp_path),
        {
            "enabled": True,
            "destination": "smb://backup:s3cr3t@nas/share/hrms",
            "auth_mode": "guest",
        },
    )

    assert "s3cr3t" not in result["remote_path"]
    assert result["remote_path"].startswith("smb://nas/share/hrms/")
    assert remote.parse_destination("webdav://user:s3cr3t@cloud/dav").display == "webdav://cloud/dav"


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


def test_test_destination_serialized_under_lock(monkeypatch):
    """Проба не должна пересекаться с копированием/ротацией."""
    lock_states: list[bool] = []

    def fake_run(args, timeout=None):
        lock_states.append(remote._OPERATION_LOCK.locked())
        return _completed()

    monkeypatch.setattr(remote, "_run", fake_run)
    remote.test_destination({"enabled": True, "destination": "smb://nas/backup/hrms"})

    assert lock_states and all(lock_states)


def test_upload_backup_copies_metadata_sidecar(monkeypatch, tmp_path):
    archive = tmp_path / "backup_db_2026-01-01_00-00-00.zip"
    archive.write_bytes(b"zip")
    archive.with_name(f"{archive.name}.json").write_text('{"backup_type": "manual"}', encoding="utf-8")

    calls: list[list[str]] = []
    monkeypatch.setattr(remote, "_run_with_progress", lambda args, progress: None)
    monkeypatch.setattr(remote, "_verify_size", lambda remote_file, size: None)
    monkeypatch.setattr(remote, "rotate", lambda cfg: [])
    monkeypatch.setattr(remote, "_run", lambda args, timeout=None: calls.append(list(args)) or _completed())

    remote.upload_backup(archive, {"destination": str(tmp_path / "remote")})

    assert [call for call in calls if call[0] == "copyto" and call[2].endswith(".zip.json")]


def test_rotate_touches_only_backup_archives_and_handles_mixed_timezones(monkeypatch):
    """В общей папке могут быть чужие zip: ротация удаляет только backup_*.zip."""
    deleted: list[str] = []

    def fake_run(args, timeout=None):
        if args[0] == "lsjson":
            return _completed(
                stdout=json.dumps([
                    {"Name": "backup_old.zip", "ModTime": "2026-01-01T00:00:00Z"},
                    {"Name": "backup_new.zip", "ModTime": "2026-02-01T00:00:00+03:00"},
                    {"Name": "other.zip", "ModTime": "2025-01-01T00:00:00Z"},
                    {"Name": "backup_notes.txt", "ModTime": "2025-01-01T00:00:00Z"},
                ])
            )
        if args[0] == "deletefile":
            deleted.append(args[1])
            return _completed()
        return _completed()

    monkeypatch.setattr(remote, "_run", fake_run)
    monkeypatch.setattr(remote, "_read_remote_meta", lambda target, name: {"backup_type": "daily"})

    cfg = remote.build_runtime({"destination": "smb://nas/share", "retention": {"daily": 1}})
    removed = remote.rotate(cfg)

    assert removed == ["backup_old.zip"]
    assert all("other.zip" not in path and "notes" not in path for path in deleted)
    assert any(path.endswith("backup_old.zip.json") for path in deleted)


def test_parse_mtime_always_timezone_aware():
    assert remote._parse_mtime("2026-01-01T00:00:00").tzinfo is not None
    assert remote._parse_mtime("2026-01-01T00:00:00Z").tzinfo is not None
    assert remote._parse_mtime("мусор").tzinfo is not None
    assert remote._parse_mtime(None).tzinfo == timezone.utc
    assert remote._parse_mtime("2026-01-01T00:00:00") < remote._parse_mtime("2026-01-02T00:00:00")


def test_upload_backup_rotation_failure_does_not_fail_copy(monkeypatch, tmp_path):
    archive = tmp_path / "backup_db_2026-01-01_00-00-00.zip"
    archive.write_bytes(b"zip")

    monkeypatch.setattr(remote, "_run_with_progress", lambda args, progress: None)
    monkeypatch.setattr(remote, "_verify_size", lambda remote_file, size: None)
    # Ротация может упасть любой ошибкой, не только RemoteBackupError.
    monkeypatch.setattr(
        remote,
        "rotate",
        lambda cfg: (_ for _ in ()).throw(RuntimeError("нет доступа к списку копий")),
    )

    result = remote.upload_backup(
        archive,
        {"enabled": True, "destination": str(tmp_path), "auth_mode": "guest"},
    )

    assert result["size"] == 3
    assert result["deleted"] == []
    assert "нет доступа" in result["rotation_error"]
