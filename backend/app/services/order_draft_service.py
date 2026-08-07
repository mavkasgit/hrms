import asyncio
import json
import os
import re
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.models.employee import Employee
from app.models.order_type import OrderType
from app.schemas.order import OrderCreate
from app.services.document_draft_service import DocumentDraftService
from app.services.order_document_service import _build_document, _build_filename


def normalize_draft_save_status(save_status: dict[str, Any] | None) -> dict[str, Any]:
    """Привести сырой блок save_status метаданных к фиксированной форме.

    Отсутствующий блок (старые черновики) трактуется как state=never.
    """
    status = save_status or {}
    return {
        "state": status.get("state", "never"),
        "last_saved_at": status.get("last_saved_at"),
        "last_error": status.get("last_error"),
        "last_error_at": status.get("last_error_at"),
    }


class OrderDraftService(DocumentDraftService):
    def __init__(self):
        super().__init__()
        self._drafts_dir = Path(settings.ORDERS_PATH) / ".drafts"
        self._save_status_lock = asyncio.Lock()

    def ensure_drafts_dir(self) -> Path:
        self._drafts_dir.mkdir(parents=True, exist_ok=True)
        return self._drafts_dir

    async def create_draft(
        self, data: OrderCreate, employee: Employee | None, order_type: OrderType, user_id: str = "system"
    ) -> dict[str, Any]:
        draft_id = str(uuid.uuid4())
        order_number = data.order_number.strip() if data.order_number else "DRAFT"
        doc, replacements = await _build_document(order_number, data, employee, order_type)
        filename = _build_filename(order_number, order_type, replacements)
        safe_filename = re.sub(r'[<>:"/\\|?*]+', "_", filename).strip() or "draft.docx"
        file_path = self.ensure_drafts_dir() / f"{draft_id}_{safe_filename}"
        await asyncio.wait_for(
            asyncio.to_thread(doc.save, str(file_path)),
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
        )

        # Сохраняем метаданные черновика (#29): полный payload создания,
        # создатель, время, статус и версия схемы. При ошибке записи
        # метаданных откатываем черновик целиком — не остаётся docx без метаданных.
        metadata = {
            "draft_id": draft_id,
            "kind": "single_order",
            "order_type_code": order_type.code,
            "payload": {
                "employee_id": data.employee_id,
                "order_type_id": data.order_type_id,
                "order_date": data.order_date.isoformat() if data.order_date else None,
                "order_number": order_number,
                "notes": data.notes,
                "extra_fields": data.extra_fields,
            },
            "created_by": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "draft",
            "save_status": {"state": "never", "last_saved_at": None, "last_error": None, "last_error_at": None},
            "schema_version": 1,
        }
        try:
            self.save_draft_metadata(draft_id, metadata)
        except Exception:
            # Откат: удаляем docx, чтобы не осталось черновика без метаданных
            try:
                file_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise

        return {"draft_id": draft_id, "file_path": str(file_path)}

    def get_draft_path(self, draft_id: str) -> Path:
        self.ensure_drafts_dir()
        if not re.fullmatch(r"[0-9a-fA-F-]{32,36}", draft_id):
            raise HRMSException("Черновик не найден", "draft_not_found", status_code=404)
        for file_path in self._drafts_dir.iterdir():
            if file_path.is_file() and file_path.name.startswith(f"{draft_id}_"):
                return file_path
        raise HRMSException("Черновик не найден", "draft_not_found", status_code=404)

    def _commit_lock_path(self, draft_id: str) -> Path:
        self.ensure_drafts_dir()
        return self._drafts_dir / f"{draft_id}.commit.lock"

    def claim_draft_for_commit(self, draft_id: str) -> Path:
        """
        Atomically claim a draft so concurrent /commit cannot create two orders.

        Raises 404 if draft file is missing, 409 if already claimed/committed.
        """
        draft_path = self.get_draft_path(draft_id)
        lock_path = self._commit_lock_path(draft_id)
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            try:
                os.write(fd, b"1")
            finally:
                os.close(fd)
        except FileExistsError as exc:
            raise HRMSException(
                "Этот черновик уже сохраняется или уже был создан как приказ",
                "draft_already_committed",
                status_code=409,
            ) from exc
        return draft_path

    def release_commit_lock(self, draft_id: str) -> None:
        """Release the commit lock so the draft can be retried after a failed save (#30)."""
        lock_path = self._commit_lock_path(draft_id)
        try:
            lock_path.unlink(missing_ok=True)
        except OSError:
            pass

    def _cleanup_files(self, record: str) -> None:
        """Файловая чистка приказа: docx + метаданные JSON + commit-lock (#84).

        Best-effort, как у всех наследников DocumentDraftService: отсутствующий
        черновик (404), сбой mkdir storage-директории и OSError не роняют
        удаление. Для приказов «запись» — это draft_id (файловый черновик,
        DB-строки до commit нет).
        """
        try:
            draft_path = self.get_draft_path(record)
            draft_path.unlink(missing_ok=True)
        except HRMSException as e:
            if e.status_code != 404:
                raise
        except OSError:
            pass

        try:
            self.get_metadata_path(record).unlink(missing_ok=True)
        except OSError:
            pass

        try:
            self._commit_lock_path(record).unlink(missing_ok=True)
        except OSError:
            pass

    def get_metadata_path(self, draft_id: str) -> Path:
        """Get the path to the draft metadata JSON file."""
        self.ensure_drafts_dir()
        return self._drafts_dir / f"{draft_id}.json"

    def save_draft_metadata(self, draft_id: str, metadata: dict[str, Any]) -> None:
        """Save draft metadata to .drafts/{draft_id}.json (atomically)."""
        metadata_path = self.get_metadata_path(draft_id)
        self._write_metadata_atomic(metadata_path, metadata)

    def _read_metadata_unlocked(self, metadata_path: Path) -> dict[str, Any] | None:
        if not metadata_path.exists():
            return None
        with open(metadata_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_metadata_atomic(self, metadata_path: Path, metadata: dict[str, Any]) -> None:
        """Write metadata via temp file + os.replace so readers never see a torn JSON."""
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = metadata_path.with_name(f".{metadata_path.name}.{uuid.uuid4().hex}.tmp")
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2, default=str)
            os.replace(temp_path, metadata_path)
        finally:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass

    async def update_save_status(
        self,
        draft_id: str,
        *,
        state: str,
        error: str | None = None,
    ) -> dict[str, Any]:
        """Записать последний исход сохранения в метаданные черновика (#52).

        Состояние «последнее событие побеждает»: ошибка после успеха показывает
        state=error (но last_saved_at сохраняется), а следующий успешный callback
        возвращает state=saved. Сериализуется asyncio-lock'ом, пишется атомарно —
        параллельные callback-и не «затирают» файл.
        """
        metadata_path = self.get_metadata_path(draft_id)
        async with self._save_status_lock:
            metadata = self._read_metadata_unlocked(metadata_path)
            if metadata is None:
                # Черновик без метаданных (удалён/не создан) — сохранять нечего.
                return normalize_draft_save_status(None)
            save_status = metadata.get("save_status") or {}
            now = datetime.now(timezone.utc).isoformat()
            if state == "saved":
                save_status["state"] = "saved"
                save_status["last_saved_at"] = now
                save_status["last_error"] = None
                save_status["last_error_at"] = None
            elif state == "error":
                save_status["state"] = "error"
                save_status["last_error"] = error or "Неизвестная ошибка сохранения"
                save_status["last_error_at"] = now
            else:
                raise ValueError(f"Unknown save status state: {state}")
            metadata["save_status"] = save_status
            self._write_metadata_atomic(metadata_path, metadata)
        return save_status

    def read_save_status(self, draft_id: str) -> dict[str, Any]:
        metadata_path = self.get_metadata_path(draft_id)
        metadata = self._read_metadata_unlocked(metadata_path)
        return normalize_draft_save_status(metadata.get("save_status") if metadata else None)

    def read_draft_metadata(self, draft_id: str) -> dict[str, Any]:
        """Read draft metadata from .drafts/{draft_id}.json."""
        metadata_path = self.get_metadata_path(draft_id)
        if not metadata_path.exists():
            raise HRMSException("Метаданные черновика не найдены", "draft_metadata_not_found", status_code=404)
        with open(metadata_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def list_drafts(self) -> list[dict[str, Any]]:
        """List all drafts with their metadata."""
        self.ensure_drafts_dir()
        drafts: list[dict[str, Any]] = []
        for meta_file in self._drafts_dir.glob("*.json"):
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                # Only include if the docx still exists
                draft_id = metadata.get("draft_id", meta_file.stem)
                try:
                    self.get_draft_path(draft_id)
                except HRMSException:
                    continue  # skip orphaned metadata
                drafts.append(metadata)
            except (json.JSONDecodeError, OSError):
                continue
        # Sort by created_at descending (newest first)
        drafts.sort(key=lambda d: d.get("created_at", ""), reverse=True)
        return drafts

    async def create_group_draft(
        self,
        order_type_code: str,
        payload: dict[str, Any],
        order_type: OrderType,
        user_id: str,
    ) -> dict[str, Any]:
        """
        Create a DOCX draft for any group order type.

        Dispatches to the correct render function based on order_type_code.
        Returns dict with draft_id and file_path.
        """
        from datetime import timedelta

        draft_id = str(uuid.uuid4())

        # Resolve the actual order number: use provided value or fallback
        order_number = payload.get("order_number")
        order_number = order_number.strip() if order_number else "Б/Н"

        # Build employee rows from payload
        employees = payload.get("employees", [])
        employee_rows = []

        def to_date(val):
            if isinstance(val, date):
                return val
            return date.fromisoformat(val) if val else None

        for emp_item in employees:
            emp_data = emp_item["employee"] if isinstance(emp_item["employee"], dict) else emp_item["employee"]
            vacation_days = emp_item["vacation_days"]

            row = {
                "employee": emp_data,
                "vacation_days": vacation_days,
            }

            # Compute vacation_end for vacation_unpaid_group
            if order_type_code == "vacation_unpaid_group" and "vacation_start" in payload:
                vacation_start = to_date(payload["vacation_start"])
                assert vacation_start is not None
                row["vacation_end"] = vacation_start + timedelta(days=vacation_days - 1)

            employee_rows.append(row)

        # Render DOCX to draft path based on order_type_code
        draft_filename = f"{draft_id}_{order_type_code}.docx"
        draft_path = self.ensure_drafts_dir() / draft_filename

        if order_type_code == "vacation_unpaid_group":
            from app.services.order_document_service import render_vacation_unpaid_group_docx

            # Reconstruct data object for render function
            from types import SimpleNamespace

            data = SimpleNamespace(
                order_date=to_date(payload["order_date"]),
                vacation_start=to_date(payload["vacation_start"]),
                order_number=order_number,
            )
            await render_vacation_unpaid_group_docx(
                order_number=order_number,
                data=data,
                order_type=order_type,
                employee_rows=employee_rows,
                output_path=draft_path,
            )

        elif order_type_code == "weekend_call_group":
            from app.services.order_document_service import generate_weekend_call_group_document

            # Reconstruct data object for render function
            from types import SimpleNamespace
            mode = payload.get("mode", "single")

            if mode == "single":
                call_start = to_date(payload["call_date"])
                assert call_start is not None
                call_end = call_start
            else:
                call_start = to_date(payload["call_date_start"])
                call_end = to_date(payload["call_date_end"])
                assert call_start is not None and call_end is not None

            data = SimpleNamespace(
                order_date=to_date(payload["order_date"]),
            )

            # Generate directly to draft_path
            _, _ = await generate_weekend_call_group_document(
                order_number=order_number,
                data=data,
                order_type=order_type,
                year_dir=self.ensure_drafts_dir(),
                employee_rows=employee_rows,
                call_start=call_start,
                call_end=call_end,
                output_path=draft_path,
            )

        else:
            raise HRMSException(f"Неподдерживаемый тип группового приказа: {order_type_code}", "unsupported_group_type", status_code=400)

        # Save metadata with full payload
        # Convert employee objects back to simple dicts for JSON serialization
        serializable_payload = {**payload, "order_number": order_number}
        if "employees" in serializable_payload:
            clean_employees = []
            for emp_item in serializable_payload["employees"]:
                clean_employees.append({
                    "employee_id": emp_item["employee_id"],
                    "vacation_days": emp_item["vacation_days"],
                })
            serializable_payload["employees"] = clean_employees

        metadata = {
            "draft_id": draft_id,
            "kind": "group_order",
            "order_type_code": order_type_code,
            "payload": serializable_payload,
            "created_by": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "save_status": {"state": "never", "last_saved_at": None, "last_error": None, "last_error_at": None},
            "schema_version": 1,
        }
        self.save_draft_metadata(draft_id, metadata)

        return {"draft_id": draft_id, "file_path": str(draft_path)}


order_draft_service = OrderDraftService()
