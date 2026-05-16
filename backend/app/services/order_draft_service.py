import asyncio
import json
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
from app.services.order_document_service import _build_document, _build_filename


class OrderDraftService:
    def __init__(self):
        self._drafts_dir = Path(settings.ORDERS_PATH) / ".drafts"

    def ensure_drafts_dir(self) -> Path:
        self._drafts_dir.mkdir(parents=True, exist_ok=True)
        return self._drafts_dir

    async def create_draft(self, data: OrderCreate, employee: Employee | None, order_type: OrderType) -> dict[str, Any]:
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
        return {"draft_id": draft_id, "file_path": str(file_path)}

    def get_draft_path(self, draft_id: str) -> Path:
        self.ensure_drafts_dir()
        if not re.fullmatch(r"[0-9a-fA-F-]{32,36}", draft_id):
            raise HRMSException("Черновик не найден", "draft_not_found", status_code=404)
        for file_path in self._drafts_dir.iterdir():
            if file_path.is_file() and file_path.name.startswith(f"{draft_id}_"):
                return file_path
        raise HRMSException("Черновик не найден", "draft_not_found", status_code=404)

    def delete_draft(self, draft_id: str) -> None:
        self.get_draft_path(draft_id).unlink()
        metadata_path = self.get_metadata_path(draft_id)
        if metadata_path.exists():
            metadata_path.unlink()

    def get_metadata_path(self, draft_id: str) -> Path:
        """Get the path to the draft metadata JSON file."""
        self.ensure_drafts_dir()
        return self._drafts_dir / f"{draft_id}.json"

    def save_draft_metadata(self, draft_id: str, metadata: dict[str, Any]) -> None:
        """Save draft metadata to .drafts/{draft_id}.json."""
        self.ensure_drafts_dir()
        metadata_path = self.get_metadata_path(draft_id)
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2, default=str)

    def read_draft_metadata(self, draft_id: str) -> dict[str, Any]:
        """Read draft metadata from .drafts/{draft_id}.json."""
        metadata_path = self.get_metadata_path(draft_id)
        if not metadata_path.exists():
            raise HRMSException("Метаданные черновика не найдены", "draft_metadata_not_found", status_code=404)
        with open(metadata_path, "r", encoding="utf-8") as f:
            return json.load(f)

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
                call_end = call_start
            else:
                call_start = to_date(payload["call_date_start"])
                call_end = to_date(payload["call_date_end"])

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
            "schema_version": 1,
        }
        self.save_draft_metadata(draft_id, metadata)

        return {"draft_id": draft_id, "file_path": str(draft_path)}


order_draft_service = OrderDraftService()
