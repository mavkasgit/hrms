import asyncio
import re
import uuid
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.models.employee import Employee
from app.models.order_type import OrderType
from app.schemas.order import OrderCreate
from app.services.order_service import order_service


class OrderDraftService:
    def __init__(self):
        self._drafts_dir = Path(settings.ORDERS_PATH) / ".drafts"

    def ensure_drafts_dir(self) -> Path:
        self._drafts_dir.mkdir(parents=True, exist_ok=True)
        return self._drafts_dir

    async def create_draft(self, data: OrderCreate, employee: Employee, order_type: OrderType) -> dict[str, Any]:
        draft_id = str(uuid.uuid4())
        order_number = data.order_number.strip() if data.order_number else "DRAFT"
        doc, replacements = await order_service._build_document(order_number, data, employee, order_type)
        filename = order_service._build_filename(order_number, order_type, replacements)
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


order_draft_service = OrderDraftService()
