# Штатное расписание — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить на страницу «Сотрудники» кнопку «Штатное расписание», которая открывает модалку с историей загруженных файлов, возможностью загрузить новый файл (docx/xlsx/pdf) и открыть текущий файл в OnlyOffice на отдельной вкладке в режиме view.

**Architecture:** 
- Backend: новая таблица `staffing_documents` хранит историю загрузок с флагом `is_current`. Новый API-router `/staffing` для CRUD + OnlyOffice-конфиг с динамическим определением `fileType`/`documentType`. 
- Frontend: новая сущность `staffing` с React Query-хуками, модалка `StaffingModal`, страница `StaffingViewPage` (OnlyOffice viewer), кнопка на `EmployeesPage`.

**Tech Stack:** FastAPI, SQLAlchemy (async), Alembic, React + TS, TanStack Query, shadcn/ui, OnlyOffice Document Server.

---

## File Structure

### Backend

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/models/staffing_document.py` | Create | SQLAlchemy модель `StaffingDocument` |
| `backend/app/models/__init__.py` | Modify | Импорт `StaffingDocument` для Alembic |
| `backend/alembic/env.py` | Modify | Импорт `StaffingDocument` в target_metadata |
| `backend/alembic/versions/XXXX_add_staffing_documents.py` | Create | Миграция создания таблицы |
| `backend/app/core/config.py` | Modify | Добавить `STAFFING_PATH` |
| `backend/app/services/onlyoffice_service.py` | Modify | Динамический `fileType`/`documentType` по расширению файла |
| `backend/app/api/staffing.py` | Create | Router: list, current, upload, onlyoffice config/file/callback |
| `backend/app/main.py` | Modify | Подключить `staffing_router` |

### Frontend

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/entities/staffing/types.ts` | Create | TypeScript типы сущности |
| `frontend/src/entities/staffing/api.ts` | Create | API-функции (axios) |
| `frontend/src/entities/staffing/useStaffing.ts` | Create | React Query хуки |
| `frontend/src/features/staffing-modal/StaffingModal.tsx` | Create | Модалка: инфо, загрузка, история, открытие |
| `frontend/src/pages/StaffingViewPage.tsx` | Create | Страница OnlyOffice viewer (mode=view) |
| `frontend/src/app/Router.tsx` | Modify | Роут `/staffing/:id/view` |
| `frontend/src/pages/EmployeesPage.tsx` | Modify | Добавить кнопку «Штатное расписание» |

---

## Task 1: Backend — Model & Migration

**Files:**
- Create: `backend/app/models/staffing_document.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/alembic/env.py`
- Create: `backend/alembic/versions/20260430_XXXX_add_staffing_documents.py`

- [ ] **Step 1.1: Write model**

```python
# backend/app/models/staffing_document.py
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func

from app.models.base import Base


class StaffingDocument(Base):
    __tablename__ = "staffing_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    file_path = Column(String(500), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_type = Column(String(10), nullable=False)  # docx, xlsx, pdf
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    uploaded_by = Column(String(100))
    is_current = Column(Boolean, default=True, nullable=False, index=True)
```

- [ ] **Step 1.2: Register model in `__init__.py`**

Modify `backend/app/models/__init__.py`, append import:
```python
from app.models.staffing_document import StaffingDocument  # noqa: F401, E402
```

- [ ] **Step 1.3: Register model in `alembic/env.py`**

Modify imports block in `backend/alembic/env.py`, append `StaffingDocument`:
```python
from app.models import Employee, EmployeeAuditLog, Order, OrderSequence, OrderType, Vacation, Reference, User, StaffingDocument  # noqa: E402
```

- [ ] **Step 1.4: Generate migration**

Run: `cd backend && alembic revision --autogenerate -m "add staffing_documents"`

Expected: новый файл в `backend/alembic/versions/` с `upgrade()` создающим таблицу `staffing_documents`.

- [ ] **Step 1.5: Apply migration**

Run: `cd backend && alembic upgrade head`

Expected: `staffing_documents` создана в БД.

- [ ] **Step 1.6: Commit**

```bash
git add backend/app/models/ backend/alembic/
git commit -m "feat(backend): add StaffingDocument model and migration"
```

---

## Task 2: Backend — Config & OnlyOffice Service Update

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/services/onlyoffice_service.py`

- [ ] **Step 2.1: Add `STAFFING_PATH` to config**

Modify `backend/app/core/config.py`, add after `PERSONAL_FILES_PATH`:
```python
    STAFFING_PATH: str = str(BASE_DIR / "data" / "staffing")
```

- [ ] **Step 2.2: Add dynamic fileType/documentType mapping in OnlyOfficeService**

Modify `backend/app/services/onlyoffice_service.py`. Add class method:

```python
    _FILE_TYPE_MAP = {
        "docx": ("docx", "word"),
        "xlsx": ("xlsx", "cell"),
        "pdf": ("pdf", "pdf"),
    }

    def _get_file_types(self, file_path: Path) -> tuple[str, str]:
        ext = file_path.suffix.lower().lstrip(".")
        return self._FILE_TYPE_MAP.get(ext, ("docx", "word"))
```

Then update `build_config` to use dynamic types:

Replace these lines inside `build_config`:
```python
            "fileType": "docx",
```
with:
```python
            "fileType": file_type,
```

and:
```python
            "documentType": "word",
```
with:
```python
            "documentType": doc_type_oo,
```

At the top of `build_config`, add:
```python
        file_type, doc_type_oo = self._get_file_types(file_path)
```

- [ ] **Step 2.3: Commit**

```bash
git add backend/app/core/config.py backend/app/services/onlyoffice_service.py
git commit -m "feat(backend): dynamic OnlyOffice file types and staffing path"
```

---

## Task 3: Backend — Staffing API Router

**Files:**
- Create: `backend/app/api/staffing.py`
- Modify: `backend/app/main.py`

- [ ] **Step 3.1: Create router**

```python
# backend/app/api/staffing.py
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import HRMSException
from app.models.staffing_document import StaffingDocument
from app.services.onlyoffice_service import onlyoffice_service

router = APIRouter(prefix="/staffing", tags=["staffing"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PDF_MEDIA_TYPE = "application/pdf"


def _get_current_user_stub() -> str:
    return "admin"


def _public_api_url(path: str) -> str:
    return f"{settings.APP_PUBLIC_URL.rstrip('/')}/api{path}"


def _staffing_dir() -> Path:
    path = Path(settings.STAFFING_PATH)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _media_type_for_ext(ext: str) -> str:
    if ext == "docx":
        return DOCX_MEDIA_TYPE
    if ext == "xlsx":
        return XLSX_MEDIA_TYPE
    if ext == "pdf":
        return PDF_MEDIA_TYPE
    return "application/octet-stream"


def _extract_callback_token(request: Request, body: dict[str, Any]) -> str | None:
    token = body.get("token")
    if token:
        return str(token)
    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip()


def _assert_valid_callback_token(request: Request, body: dict[str, Any]) -> None:
    token = _extract_callback_token(request, body)
    if not token or not onlyoffice_service.validate_callback_token(token):
        raise HRMSException("Невалидный JWT OnlyOffice", "invalid_onlyoffice_jwt", status_code=403)


class StaffingDocumentResponse(BaseModel):
    id: int
    original_filename: str
    file_type: str
    uploaded_at: datetime
    uploaded_by: str | None
    is_current: bool

    class Config:
        from_attributes = True


class StaffingCurrentResponse(BaseModel):
    document: StaffingDocumentResponse | None


@router.get("", response_model=list[StaffingDocumentResponse])
async def list_staffing_documents(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await db.execute(
        select(StaffingDocument).order_by(StaffingDocument.uploaded_at.desc())
    )
    return result.scalars().all()


@router.get("/current", response_model=StaffingCurrentResponse)
async def get_current_staffing_document(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await db.execute(
        select(StaffingDocument)
        .where(StaffingDocument.is_current == True)
        .order_by(StaffingDocument.uploaded_at.desc())
        .limit(1)
    )
    doc = result.scalar_one_or_none()
    return {"document": doc}


@router.post("/upload", response_model=StaffingDocumentResponse, status_code=201)
async def upload_staffing_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not file.filename:
        raise HRMSException("Имя файла не указано", "invalid_filename", status_code=400)

    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in ("docx", "xlsx", "pdf"):
        raise HRMSException(
            "Допустимые форматы: .docx, .xlsx, .pdf",
            "invalid_file_type",
            status_code=400,
        )

    content = await file.read()
    if len(content) > settings.MAX_DOCUMENT_SIZE:
        raise HRMSException(
            f"Файл слишком большой (макс {settings.MAX_DOCUMENT_SIZE // 1024 // 1024} МБ)",
            "file_too_large",
            status_code=413,
        )

    staffing_dir = _staffing_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = Path(file.filename).stem.replace(" ", "_")
    storage_filename = f"{timestamp}_{safe_name}.{ext}"
    file_path = staffing_dir / storage_filename

    file_path.write_bytes(content)

    # Mark previous current as non-current
    await db.execute(
        update(StaffingDocument)
        .where(StaffingDocument.is_current == True)
        .values(is_current=False)
    )

    doc = StaffingDocument(
        file_path=str(file_path),
        original_filename=file.filename,
        file_type=ext,
        uploaded_by=current_user,
        is_current=True,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/{doc_id}/onlyoffice/config")
async def staffing_onlyoffice_config(
    doc_id: int,
    mode: str = Query("view", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        raise HRMSException("OnlyOffice отключен", "onlyoffice_disabled", status_code=503)

    result = await db.execute(select(StaffingDocument).where(StaffingDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HRMSException("Документ не найден", "staffing_doc_not_found", status_code=404)

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HRMSException("Файл отсутствует на диске", "staffing_file_missing", status_code=404)

    config = onlyoffice_service.build_config(
        doc_type="staffing",
        doc_id=doc_id,
        file_path=file_path,
        title=doc.original_filename,
        callback_url=_public_api_url(f"/staffing/{doc_id}/onlyoffice/callback"),
        file_url=_public_api_url(f"/staffing/{doc_id}/file"),
        mode=mode,
    )
    config["documentServerUrl"] = settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
    return config


@router.get("/{doc_id}/file")
async def staffing_file(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    result = await db.execute(select(StaffingDocument).where(StaffingDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HRMSException("Документ не найден", "staffing_doc_not_found", status_code=404)

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HRMSException("Файл отсутствует на диске", "staffing_file_missing", status_code=404)

    return FileResponse(
        str(file_path),
        filename=doc.original_filename,
        media_type=_media_type_for_ext(doc.file_type),
    )


@router.post("/{doc_id}/onlyoffice/callback")
async def staffing_onlyoffice_callback(
    doc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})
    body = await request.json()
    _assert_valid_callback_token(request, body)

    # Staffing docs are view-only; no saving needed, but handle gracefully
    if body.get("status") in (2, 6) and body.get("url"):
        result = await db.execute(select(StaffingDocument).where(StaffingDocument.id == doc_id))
        doc = result.scalar_one_or_none()
        if doc:
            await onlyoffice_service.download_and_replace(str(body["url"]), Path(doc.file_path))
    return {"error": 0}
```

- [ ] **Step 3.2: Register router in `main.py`**

Modify `backend/app/main.py`:

Add import:
```python
from app.api.staffing import router as staffing_router
```

Add include:
```python
app.include_router(staffing_router, prefix="/api")
```

- [ ] **Step 3.3: Commit**

```bash
git add backend/app/api/staffing.py backend/app/main.py
git commit -m "feat(backend): staffing documents API with OnlyOffice view support"
```

---

## Task 4: Frontend — Staffing Entity (Types, API, Hooks)

**Files:**
- Create: `frontend/src/entities/staffing/types.ts`
- Create: `frontend/src/entities/staffing/api.ts`
- Create: `frontend/src/entities/staffing/useStaffing.ts`

- [ ] **Step 4.1: Create types**

```typescript
// frontend/src/entities/staffing/types.ts
export interface StaffingDocument {
  id: number
  original_filename: string
  file_type: string
  uploaded_at: string
  uploaded_by: string | null
  is_current: boolean
}

export interface StaffingCurrentResponse {
  document: StaffingDocument | null
}
```

- [ ] **Step 4.2: Create API client**

```typescript
// frontend/src/entities/staffing/api.ts
import axios from "@/shared/api/axios"
import type { StaffingDocument, StaffingCurrentResponse } from "./types"
import type { OnlyOfficeConfig } from "@/entities/order/onlyofficeTypes"

export async function getStaffingHistory(): Promise<StaffingDocument[]> {
  const { data } = await axios.get<StaffingDocument[]>("/staffing")
  return data
}

export async function getCurrentStaffing(): Promise<StaffingCurrentResponse> {
  const { data } = await axios.get<StaffingCurrentResponse>("/staffing/current")
  return data
}

export async function uploadStaffingDocument(file: File): Promise<StaffingDocument> {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await axios.post<StaffingDocument>("/staffing/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function fetchStaffingOnlyOfficeConfig(
  docId: number,
  mode: "edit" | "view" = "view"
): Promise<OnlyOfficeConfig> {
  const { data } = await axios.get<OnlyOfficeConfig>(`/staffing/${docId}/onlyoffice/config`, {
    params: { mode },
  })
  return data
}
```

- [ ] **Step 4.3: Create hooks**

```typescript
// frontend/src/entities/staffing/useStaffing.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"

export function useStaffingHistory() {
  return useQuery({
    queryKey: ["staffing", "history"],
    queryFn: api.getStaffingHistory,
  })
}

export function useCurrentStaffing() {
  return useQuery({
    queryKey: ["staffing", "current"],
    queryFn: api.getCurrentStaffing,
  })
}

export function useUploadStaffingDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.uploadStaffingDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staffing", "history"] })
      queryClient.invalidateQueries({ queryKey: ["staffing", "current"] })
    },
  })
}

export function useStaffingOnlyOfficeConfig(docId: number, mode: "edit" | "view" = "view") {
  return useQuery({
    queryKey: ["onlyoffice-config", "staffing", docId, mode],
    queryFn: () => api.fetchStaffingOnlyOfficeConfig(docId, mode),
    enabled: docId > 0,
  })
}
```

- [ ] **Step 4.4: Commit**

```bash
git add frontend/src/entities/staffing/
git commit -m "feat(frontend): staffing entity types, api and hooks"
```

---

## Task 5: Frontend — Staffing Modal

**Files:**
- Create: `frontend/src/features/staffing-modal/StaffingModal.tsx`

- [ ] **Step 5.1: Create modal component**

```tsx
// frontend/src/features/staffing-modal/StaffingModal.tsx
import { useRef, useState } from "react"
import { FileText, Upload, Eye, Clock } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import {
  useCurrentStaffing,
  useStaffingHistory,
  useUploadStaffingDocument,
} from "@/entities/staffing/useStaffing"
import type { StaffingDocument } from "@/entities/staffing/types"

interface StaffingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StaffingModal({ open, onOpenChange }: StaffingModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: currentData } = useCurrentStaffing()
  const { data: history, isLoading: historyLoading } = useStaffingHistory()
  const uploadMutation = useUploadStaffingDocument()
  const [uploadError, setUploadError] = useState<string | null>(null)

  const currentDoc = currentData?.document

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    try {
      await uploadMutation.mutateAsync(file)
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || "Ошибка загрузки файла")
    }
  }

  const handleOpenDocument = (doc: StaffingDocument) => {
    window.open(`/staffing/${doc.id}/view`, "_blank", "noopener,noreferrer")
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Штатное расписание
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-auto pr-1">
          {/* Current document info */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            {currentDoc ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Последнее обновление:</span>
                  <span className="font-medium">{formatDate(currentDoc.uploaded_at)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Файл:</span>
                  <span className="font-medium">{currentDoc.original_filename}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => handleOpenDocument(currentDoc)}>
                    <Eye className="mr-2 h-4 w-4" />
                    Открыть штатное расписание
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Штатное расписание ещё не загружено.
              </p>
            )}
          </div>

          {/* Upload */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/50 transition-colors"
               onClick={() => fileInputRef.current?.click()}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.xlsx,.pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Нажмите для загрузки файла
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Допустимые форматы: .docx, .xlsx, .pdf (макс 10 МБ)
            </p>
          </div>

          {uploadMutation.isPending && (
            <p className="text-sm text-muted-foreground text-center">Загрузка...</p>
          )}
          {uploadError && (
            <p className="text-sm text-destructive text-center">{uploadError}</p>
          )}

          {/* History */}
          <div>
            <h3 className="text-sm font-medium mb-2">История загрузок</h3>
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Загрузка...</p>
            ) : !history || history.length === 0 ? (
              <p className="text-sm text-muted-foreground">История пуста</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Файл</th>
                      <th className="text-left px-3 py-2 font-medium">Дата</th>
                      <th className="text-right px-3 py-2 font-medium">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((doc) => (
                      <tr key={doc.id} className="border-t hover:bg-muted/50">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {doc.is_current && (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                Текущий
                              </span>
                            )}
                            <span className="truncate max-w-[200px]" title={doc.original_filename}>
                              {doc.original_filename}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {formatDate(doc.uploaded_at)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDocument(doc)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5.2: Commit**

```bash
git add frontend/src/features/staffing-modal/
git commit -m "feat(frontend): staffing modal with upload, history and open"
```

---

## Task 6: Frontend — Staffing View Page & Router

**Files:**
- Create: `frontend/src/pages/StaffingViewPage.tsx`
- Modify: `frontend/src/app/Router.tsx`

- [ ] **Step 6.1: Create view page**

```tsx
// frontend/src/pages/StaffingViewPage.tsx
import { useParams } from "react-router-dom"
import { useStaffingOnlyOfficeConfig } from "@/entities/staffing/useStaffing"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"

export function StaffingViewPage() {
  const { id } = useParams<{ id: string }>()
  const docId = id ? Number.parseInt(id, 10) : 0
  const { data, isLoading, error } = useStaffingOnlyOfficeConfig(
    Number.isFinite(docId) ? docId : 0,
    "view"
  )

  return (
    <div className="h-screen bg-background">
      <OrderEditor
        config={data}
        isLoading={isLoading}
        error={error as Error | null}
        title="Штатное расписание"
      />
    </div>
  )
}
```

- [ ] **Step 6.2: Add route**

Modify `frontend/src/app/Router.tsx`:

Add import:
```typescript
import { StaffingViewPage } from "@/pages/StaffingViewPage"
```

Add route in the array with Layout children (or as a separate top-level route if we want full-screen without layout). Since `OrderEditorPage` is top-level (no Layout) to be full-screen, we do the same:

```typescript
  {
    path: "/staffing/:id/view",
    element: <StaffingViewPage />,
  },
```

Add this object right after the `/orders/drafts/:draftId/edit-docx` route object and before the closing `])`.

- [ ] **Step 6.3: Commit**

```bash
git add frontend/src/pages/StaffingViewPage.tsx frontend/src/app/Router.tsx
git commit -m "feat(frontend): staffing OnlyOffice view page and route"
```

---

## Task 7: Frontend — Add Button to EmployeesPage

**Files:**
- Modify: `frontend/src/pages/EmployeesPage.tsx`

- [ ] **Step 7.1: Import icon and modal**

At the top of `EmployeesPage.tsx`, add `Building2` to the lucide import and import the modal:

```typescript
import { Plus, Search, Filter, Pencil, ArrowUp, ArrowDown, ArrowUpDown, Upload, ScrollText, Tag, Building2 } from "lucide-react"
```

And add:
```typescript
import { StaffingModal } from "@/features/staffing-modal/StaffingModal"
```

- [ ] **Step 7.2: Add state and modal**

In the component state section (near `formOpen`, `importOpen`, `auditLogOpen`), add:
```typescript
  const [staffingOpen, setStaffingOpen] = useState(false)
```

- [ ] **Step 7.3: Add button in the toolbar**

In the header flex container (near the Журнал/Импорт/Добавить buttons), add before the Журнал button:

```tsx
          <Button variant="outline" onClick={() => setStaffingOpen(true)}>
            <Building2 className="mr-2 h-4 w-4" />
            Штатное расписание
          </Button>
```

- [ ] **Step 7.4: Add modal at the bottom**

At the bottom of the returned JSX (after `<ImportEmployeesModal ... />`), add:

```tsx
      <StaffingModal open={staffingOpen} onOpenChange={setStaffingOpen} />
```

- [ ] **Step 7.5: Commit**

```bash
git add frontend/src/pages/EmployeesPage.tsx
git commit -m "feat(frontend): add staffing schedule button to EmployeesPage"
```

---

## Task 8: End-to-End Verification

- [ ] **Step 8.1: Start backend and frontend**

Run backend:
```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

Run frontend (in another terminal):
```bash
cd frontend && npm run dev
```

- [ ] **Step 8.2: Manual test checklist**

1. Открыть `/employees` → видна кнопка «Штатное расписание» с иконкой `Building2`.
2. Нажать кнопку → открывается модалка с сообщением «Штатное расписание ещё не загружено».
3. Нажать зону загрузки → выбрать `.docx` / `.xlsx` / `.pdf` → файл загружается, модалка показывает «Текущий» файл и дату.
4. Нажать «Открыть штатное расписание» → открывается новая вкладка `/staffing/:id/view` с OnlyOffice в режиме view (редактирование заблокировано).
5. Перезагрузить страницу `/employees` → модалка показывает актуальный файл и историю загрузок.
6. Загрузить ещё один файл → в истории появляется новый «Текущий», старый помечен как обычный.

- [ ] **Step 8.3: Commit (if any fixes needed)**

Apply fixes and commit separately.

---

## Self-Review

**1. Spec coverage:**
- ✅ Кнопка «Штатное расписание» на панели сотрудников — Task 7.
- ✅ Модалка с выбором загрузить/открыть — Task 5.
- ✅ Инфо по последней дате обновления — Task 5 (current doc block).
- ✅ Открытие вордовского (и xlsx/pdf) документа на отдельной вкладке в режиме только чтения — Tasks 2, 3, 6.
- ✅ История загрузок — Task 5 (history table), Task 1 (model is_current flag).

**2. Placeholder scan:**
- ✅ No TBD/TODO.
- ✅ All code blocks contain complete implementations.
- ✅ Exact file paths specified.

**3. Type consistency:**
- ✅ `StaffingDocument` fields match between backend model, Pydantic schema, frontend types.
- ✅ `file_type` uses same values (`docx`, `xlsx`, `pdf`) everywhere.
- ✅ OnlyOffice config types reused from existing `onlyofficeTypes.ts`.

---

## Execution Handoff

**Plan complete and saved to `.opencode/plans/2026-04-30-staffing-schedule.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** — Execute tasks in this session using tools directly, batch execution with checkpoints.

**Which approach do you prefer?**
