"""In-process tracker for OnlyOffice forcesave attempts.

Allows FE/services to poll until a forcesave is actually persisted
(via callback), failed, or reported as no_changes (CommandService error 4).

Memory-only with 10-minute TTL; structure is dict+timestamp for a later Redis port.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

TTL_SECONDS = 10 * 60

SaveState = str  # pending | persisted | failed | no_changes | unknown


class OnlyOfficeSaveTracker:
    """Thread-safe (asyncio.Lock) in-process save attempt registry."""

    def __init__(self, ttl_seconds: int = TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._lock = asyncio.Lock()
        self._attempts: dict[str, dict[str, Any]] = {}

    def _purge_unlocked(self, now: float | None = None) -> None:
        now = time.time() if now is None else now
        expired = [
            sid
            for sid, entry in self._attempts.items()
            if now - float(entry.get("created_at", 0)) > self._ttl
        ]
        for sid in expired:
            del self._attempts[sid]

    async def register(self, save_id: str, doc_type: str, doc_id: str | int) -> None:
        async with self._lock:
            self._purge_unlocked()
            now = time.time()
            self._attempts[save_id] = {
                "save_id": save_id,
                "doc_type": doc_type,
                "doc_id": str(doc_id),
                "state": "pending",
                "oo_status": None,
                "file_mtime": None,
                "error": None,
                "created_at": now,
                "updated_at": now,
            }

    async def mark_persisted(
        self,
        save_id: str,
        oo_status: int | None,
        file_mtime: int | float | None,
    ) -> None:
        async with self._lock:
            self._purge_unlocked()
            entry = self._attempts.get(save_id)
            if not entry:
                return
            entry["state"] = "persisted"
            entry["oo_status"] = oo_status
            entry["file_mtime"] = int(file_mtime) if file_mtime is not None else None
            entry["error"] = None
            entry["updated_at"] = time.time()

    async def mark_failed(
        self,
        save_id: str,
        error: str,
        oo_status: int | None = None,
    ) -> None:
        async with self._lock:
            self._purge_unlocked()
            entry = self._attempts.get(save_id)
            if not entry:
                return
            entry["state"] = "failed"
            entry["error"] = error
            if oo_status is not None:
                entry["oo_status"] = oo_status
            entry["updated_at"] = time.time()

    async def mark_no_changes(self, save_id: str) -> None:
        async with self._lock:
            self._purge_unlocked()
            entry = self._attempts.get(save_id)
            if not entry:
                return
            entry["state"] = "no_changes"
            entry["error"] = None
            entry["updated_at"] = time.time()

    async def get(self, save_id: str) -> dict[str, Any]:
        async with self._lock:
            self._purge_unlocked()
            entry = self._attempts.get(save_id)
            if not entry:
                return {
                    "save_id": save_id,
                    "state": "unknown",
                    "oo_status": None,
                    "file_mtime": None,
                    "error": None,
                }
            return {
                "save_id": entry["save_id"],
                "state": entry["state"],
                "oo_status": entry["oo_status"],
                "file_mtime": entry["file_mtime"],
                "error": entry["error"],
            }

    async def clear(self) -> None:
        """Test helper: drop all attempts."""
        async with self._lock:
            self._attempts.clear()


onlyoffice_save_tracker = OnlyOfficeSaveTracker()
