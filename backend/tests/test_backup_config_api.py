"""Контракт API настроек внешней копии бэкапов (#126).

Проверяет то, что видит UI: пароль не отдаётся, ошибки настроек — 422,
а ручная копия не требует включённой автокопии.
"""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api import backups


@pytest.fixture
def config_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(backups, "BACKUPS_DIR", tmp_path)
    return tmp_path


def _client() -> AsyncClient:
    """Минимальное приложение с одним роутером: не тянем остальной API."""
    test_app = FastAPI()
    test_app.include_router(backups.router, prefix="/api")
    return AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test")


@pytest.mark.asyncio
async def test_config_masks_password_and_keeps_it_until_cleared(config_dir):
    async with _client() as client:
        initial = await client.get("/api/backups/config")
        assert initial.status_code == 200
        body = initial.json()
        assert body["remote"]["has_password"] is False
        assert "password_enc" not in body["remote"]

        saved = await client.patch(
            "/api/backups/config",
            json={
                "remote": {
                    "destination": "smb://nas/backup/hrms",
                    "auth_mode": "credentials",
                    "username": "backup",
                    "password": "s3cr3t",
                }
            },
        )
        assert saved.status_code == 200
        saved_body = saved.json()
        assert saved_body["remote"]["has_password"] is True
        assert "password_enc" not in saved_body["remote"]
        assert "s3cr3t" not in saved.text

        kept = await client.patch("/api/backups/config", json={"remote": {"bwlimit": "10M"}})
        assert kept.json()["remote"]["has_password"] is True

        cleared = await client.patch("/api/backups/config", json={"remote": {"password": ""}})
        assert cleared.json()["remote"]["has_password"] is False


@pytest.mark.asyncio
async def test_config_rejects_invalid_settings_with_422(config_dir):
    async with _client() as client:
        invalid_time = await client.patch("/api/backups/config", json={"time_of_day": "25:99"})
        assert invalid_time.status_code == 422

        no_destination = await client.patch(
            "/api/backups/config",
            json={"remote": {"enabled": True, "destination": ""}},
        )
        assert no_destination.status_code == 422

        guest_sftp = await client.patch(
            "/api/backups/config",
            json={
                "remote": {
                    "destination": "sftp://host/backups",
                    "auth_mode": "guest",
                }
            },
        )
        assert guest_sftp.status_code == 422

        nfs_credentials = await client.patch(
            "/api/backups/config",
            json={
                "remote": {
                    "destination": "nfs://nas/export/hrms",
                    "auth_mode": "credentials",
                    "username": "backup",
                }
            },
        )
        assert nfs_credentials.status_code == 422


@pytest.mark.asyncio
async def test_remote_test_without_destination_is_422(config_dir):
    async with _client() as client:
        response = await client.post("/api/backups/remote/test", json={})
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_manual_upload_needs_destination_but_not_enabled(config_dir, monkeypatch):
    archive = config_dir / "backup_db_2026-01-01_00-00-00.zip"
    archive.write_bytes(b"zip")

    async with _client() as client:
        saved = await client.patch(
            "/api/backups/config",
            json={"remote": {"enabled": False, "destination": str(config_dir / "remote")}},
        )
        assert saved.status_code == 200
        assert saved.json()["remote"]["enabled"] is False

        calls: list[str] = []

        def fake_upload(local_path, raw, progress=None):
            calls.append(local_path.name)
            return {"ok": True, "filename": local_path.name, "remote_path": "remote/file.zip"}

        monkeypatch.setattr(backups.backup_remote, "upload_with_status", fake_upload)

        response = await client.post(f"/api/backups/{archive.name}/upload-remote")
        assert response.status_code == 200
        assert response.json()["ok"] is True
        assert calls == [archive.name]
