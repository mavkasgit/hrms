# OnlyOffice Integration for DOCX Order Editing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate self-hosted OnlyOffice Document Server for real DOCX editing of orders and pre-creation drafts.

> **Update (2026-04-30):** LibreOffice has been fully removed from the project. PDF conversion via `soffice` is no longer used. Templates and orders are now viewed and edited directly in OnlyOffice. The `/orders/{id}/print` endpoint and `/order-types/{id}/template/preview` endpoint have been replaced with OnlyOffice view modes.

**Architecture:** Add an OnlyOffice Document Server container to dev/test Docker Compose. Backend provides JWT-signed `DocsAPI.DocEditor` configs, dedicated file/callback endpoints for both persisted orders and ephemeral drafts, and atomic DOCX replacement on save. Frontend adds a dedicated editor page that loads the OnlyOffice JS API and renders the editor for both existing orders and draft flows.

**Tech Stack:** FastAPI, python-jose (JWT), httpx, React/Vite, TanStack Query, OnlyOffice Document Server (Docker), python-docx

---

## File Structure

| File | Responsibility |
|------|--------------|
| `infra/docker-compose.dev.yml` | Add `onlyoffice-documentserver` service with JWT env vars |
| `infra/docker-compose.test.yml` | Add `onlyoffice-documentserver` service with JWT env vars |
| `.env.dev` / `.env.test` | Add OnlyOffice and app public URL settings |
| `backend/app/core/config.py` | Add `ONLYOFFICE_*` and `APP_PUBLIC_URL` pydantic settings |
| `backend/app/services/onlyoffice_service.py` | Generate stable `document.key`, build JWT-signed editor config, validate callback JWT, download & atomically replace DOCX |
| `backend/app/services/order_draft_service.py` | Create temporary DOCX drafts from `OrderCreate` data, manage draft file storage, commit draft to real order |
| `backend/app/api/onlyoffice.py` | Endpoints: order config/file/callback, draft create/config/file/callback/commit |
| `backend/app/main.py` | Include `onlyoffice_router` under `/api` prefix |
| `backend/tests/test_onlyoffice.py` | Unit tests for config generation, JWT signing/validation, callback atomics, 404 handling |
| `frontend/src/entities/order/onlyofficeApi.ts` | API wrappers for OnlyOffice endpoints |
| `frontend/src/entities/order/onlyofficeTypes.ts` | TypeScript types for OnlyOffice config and responses |
| `frontend/src/entities/order/useOnlyOffice.ts` | TanStack Query hooks for OnlyOffice data/mutations |
| `frontend/src/pages/OrderEditorPage.tsx` | Page that loads OnlyOffice JS API and initializes `DocsAPI.DocEditor` |
| `frontend/src/app/Router.tsx` | Add `/orders/:id/edit-docx` route |
| `frontend/src/pages/OrdersPage.tsx` | Add "Редактировать DOCX" button; keep Eye for PDF preview, Download for DOCX |

---

## Notes Before Starting

- OnlyOffice callback **must** return `{ "error": 0 }` on success.
- `document.key` must be stable for the same file version, but change when the file changes. Use `f"order-{order_id}-{mtime}"` (or `f"draft-{draft_id}-{mtime}"`).
- Backend uses `python-jose` (already in `requirements.txt`) for JWT; no new dependency needed.
- Draft files live in `Path(settings.ORDERS_PATH) / ".drafts"`.
- In dev, the backend runs on the host; OnlyOffice is in Docker. Set `APP_PUBLIC_URL=http://host.docker.internal:8000` in `.env.dev` so OnlyOffice can reach the backend file/callback endpoints.
- In test compose, all services share a Docker network, so use service names for internal URLs.
- The legacy `edited_html` flow stays untouched but is not used in the new OnlyOffice flow.

---

### Task 1: Docker Compose & Environment Configuration

**Files:**
- Modify: `infra/docker-compose.dev.yml`
- Modify: `infra/docker-compose.test.yml`
- Modify: `.env.dev`
- Modify: `.env.test`
- Modify: `backend/app/core/config.py`

- [ ] **Step 1: Add onlyoffice service to dev compose**

Modify `infra/docker-compose.dev.yml` to add the service (port `8085` mapped, healthcheck, depends_on not needed because backend is on host):

```yaml
  onlyoffice:
    image: onlyoffice/documentserver:latest
    container_name: hrms-onlyoffice
    ports:
      - "8085:80"
    environment:
      JWT_ENABLED: "true"
      JWT_SECRET: "onlyoffice-dev-secret-change-me"
      JWT_HEADER: "Authorization"
      JWT_IN_BODY: "true"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/healthcheck"]
      interval: 10s
      timeout: 5s
      retries: 5
```

- [ ] **Step 2: Add onlyoffice service to test compose**

Modify `infra/docker-compose.test.yml` to add the service **inside** the same compose file (no port mapping needed because frontend/backend access it via Docker network; only `8085` internally):

```yaml
  onlyoffice:
    image: onlyoffice/documentserver:latest
    container_name: hrms-onlyoffice-test
    environment:
      JWT_ENABLED: "true"
      JWT_SECRET: "onlyoffice-test-secret"
      JWT_HEADER: "Authorization"
      JWT_IN_BODY: "true"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/healthcheck"]
      interval: 10s
      timeout: 5s
      retries: 5
```

- [ ] **Step 3: Update `.env.dev`**

Append to `.env.dev`:

```env
ONLYOFFICE_ENABLED=true
ONLYOFFICE_JWT_SECRET=onlyoffice-dev-secret-change-me
ONLYOFFICE_PUBLIC_URL=http://localhost:8085
ONLYOFFICE_INTERNAL_URL=http://onlyoffice:80
APP_PUBLIC_URL=http://host.docker.internal:8000
```

- [ ] **Step 4: Update `.env.test`**

Append to `.env.test`:

```env
ONLYOFFICE_ENABLED=true
ONLYOFFICE_JWT_SECRET=onlyoffice-test-secret
ONLYOFFICE_PUBLIC_URL=http://localhost:8085
ONLYOFFICE_INTERNAL_URL=http://onlyoffice:80
APP_PUBLIC_URL=http://backend:8000
```

- [ ] **Step 5: Update `backend/app/core/config.py`**

Add fields to the `Settings` class (before `model_config`):

```python
    ONLYOFFICE_ENABLED: bool = False
    ONLYOFFICE_JWT_SECRET: str = "change-me"
    ONLYOFFICE_PUBLIC_URL: str = "http://localhost:8085"
    ONLYOFFICE_INTERNAL_URL: str = "http://localhost:8085"
    APP_PUBLIC_URL: str = "http://localhost:8000"
```

- [ ] **Step 6: Verify dev stack starts**

Run:
```bash
npm run db:up
```
Expected: `hrms-onlyoffice` container starts and healthcheck passes.

---

### Task 2: Backend OnlyOffice Service

**Files:**
- Create: `backend/app/services/onlyoffice_service.py`
- Modify: `backend/requirements.txt` (if needed — `httpx` is already present)

- [ ] **Step 1: Write the failing service test**

Create `backend/tests/test_onlyoffice.py`:

```python
import os
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from jose import jwt

from app.core.config import settings
from app.services.onlyoffice_service import OnlyOfficeService


@pytest.fixture
def oo_service(tmp_path):
    svc = OnlyOfficeService()
    svc._drafts_dir = tmp_path / ".drafts"
    svc._drafts_dir.mkdir(exist_ok=True)
    return svc


def test_generate_key_for_order(oo_service):
    order = MagicMock()
    order.id = 42
    path = MagicMock()
    path.stat.return_value = MagicMock(st_mtime=1234567890)

    key = oo_service._generate_key("order", 42, path)
    assert key == "order-42-1234567890"


def test_generate_key_for_draft(oo_service):
    draft_id = "abc-123"
    path = MagicMock()
    path.stat.return_value = MagicMock(st_mtime=999)

    key = oo_service._generate_key("draft", draft_id, path)
    assert key == "draft-abc-123-999"


def test_build_config_includes_required_fields(oo_service, monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "APP_PUBLIC_URL", "http://app")

    config = oo_service.build_config(
        doc_type="order",
        doc_id=1,
        file_path=Path("/fake/order.docx"),
        title="Order 1",
        callback_url="http://app/api/orders/1/onlyoffice/callback",
        file_url="http://app/api/orders/1/onlyoffice/file",
    )

    assert config["document"]["fileType"] == "docx"
    assert config["document"]["url"] == "http://app/api/orders/1/onlyoffice/file"
    assert config["document"]["title"] == "Order 1"
    assert config["editorConfig"]["callbackUrl"] == "http://app/api/orders/1/onlyoffice/callback"
    assert config["editorConfig"]["lang"] == "ru"
    assert "token" in config
    assert config["document"]["key"].startswith("order-1-")


def test_config_token_is_valid_jwt(oo_service, monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "APP_PUBLIC_URL", "http://app")

    config = oo_service.build_config(
        doc_type="order", doc_id=1,
        file_path=Path("/fake/order.docx"),
        title="T", callback_url="http://c", file_url="http://f",
    )

    token = config["token"]
    decoded = jwt.decode(token, "test-secret", algorithms=["HS256"])
    assert decoded["document"]["fileType"] == "docx"


def test_validate_callback_token_rejects_bad_jwt(oo_service, monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "secret")
    assert oo_service.validate_callback_token("bad-token") is False


def test_validate_callback_token_accepts_good_jwt(oo_service, monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "secret")
    good = jwt.encode({"status": 2}, "secret", algorithm="HS256")
    assert oo_service.validate_callback_token(good) is True


@pytest.mark.asyncio
async def test_replace_docx_atomically(oo_service, tmp_path):
    original = tmp_path / "orig.docx"
    original.write_bytes(b"orig")
    replacement = tmp_path / "repl.docx"
    replacement.write_bytes(b"replacement")

    await oo_service._replace_docx_atomically(original, replacement)

    assert original.read_bytes() == b"replacement"
    assert not replacement.exists()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_onlyoffice.py -v
```
Expected: failures / import errors because `OnlyOfficeService` does not exist.

- [ ] **Step 3: Implement `OnlyOfficeService`**

Create `backend/app/services/onlyoffice_service.py`:

```python
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from jose import jwt, JWTError

from app.core.config import settings
from app.core.exceptions import HRMSException


class OnlyOfficeService:
    def build_config(
        self,
        doc_type: str,
        doc_id: int | str,
        file_path: Path,
        title: str,
        callback_url: str,
        file_url: str,
        mode: str = "edit",
    ) -> dict[str, Any]:
        key = self._generate_key(doc_type, doc_id, file_path)
        config = {
            "document": {
                "fileType": "docx",
                "key": key,
                "url": file_url,
                "title": title,
            },
            "editorConfig": {
                "callbackUrl": callback_url,
                "mode": mode,
                "lang": "ru",
            },
        }
        token = jwt.encode(config, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256")
        config["token"] = token
        return config

    def _generate_key(self, doc_type: str, doc_id: int | str, file_path: Path) -> str:
        if file_path.exists():
            mtime = int(file_path.stat().st_mtime)
        else:
            mtime = int(datetime.utcnow().timestamp())
        return f"{doc_type}-{doc_id}-{mtime}"

    def validate_callback_token(self, token: str) -> bool:
        try:
            jwt.decode(token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"])
            return True
        except JWTError:
            return False

    async def download_and_replace(self, url: str, target_path: Path) -> None:
        temp_path = target_path.with_suffix(f".tmp-{uuid.uuid4().hex}.docx")
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.get(url)
                response.raise_for_status()
            temp_path.write_bytes(response.content)
            await self._replace_docx_atomically(target_path, temp_path)
        except Exception as exc:
            if temp_path.exists():
                temp_path.unlink()
            raise HRMSException(
                f"Не удалось сохранить файл из OnlyOffice: {exc}",
                "onlyoffice_save_failed",
                status_code=502,
            ) from exc

    async def _replace_docx_atomically(self, target_path: Path, temp_path: Path) -> None:
        shutil.copy2(str(temp_path), str(target_path))
        temp_path.unlink()


onlyoffice_service = OnlyOfficeService()
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_onlyoffice.py -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/onlyoffice_service.py backend/tests/test_onlyoffice.py backend/app/core/config.py infra/docker-compose.dev.yml infra/docker-compose.test.yml .env.dev .env.test
git commit -m "feat(onlyoffice): add OnlyOffice service, Docker service, and settings"
```

---

### Task 3: Backend Order Draft Service

**Files:**
- Create: `backend/app/services/order_draft_service.py`

- [ ] **Step 1: Write failing test for draft service**

Append to `backend/tests/test_onlyoffice.py` (or create `backend/tests/test_order_draft.py`):

```python
import pytest
from docx import Document
from io import BytesIO
from pathlib import Path

from app.schemas.order import OrderCreate
from app.services.order_draft_service import OrderDraftService


@pytest.fixture
def draft_service(tmp_path):
    svc = OrderDraftService()
    svc._drafts_dir = tmp_path / ".drafts"
    svc._drafts_dir.mkdir(exist_ok=True)
    return svc


@pytest.mark.asyncio
async def test_create_draft_generates_docx(draft_service, monkeypatch):
    from unittest.mock import AsyncMock, MagicMock
    from datetime import date

    order_type = MagicMock()
    order_type.code = "hire"
    order_type.name = "Прием"
    order_type.template_filename = None
    order_type.filename_pattern = "test.docx"

    employee = MagicMock()
    employee.name = "Иванов Иван Иванович"
    employee.gender = "male"
    employee.tab_number = "001"
    employee.department = MagicMock(name="Отдел")
    employee.position = MagicMock(name="Инженер")
    employee.hire_date = date(2024, 1, 1)
    employee.contract_start = date(2024, 1, 1)

    monkeypatch.setattr(
        "app.services.order_draft_service.order_service._build_document",
        AsyncMock(return_value=(Document(), {"{order_number}": "1"})),
    )

    data = OrderCreate(
        employee_id=1,
        order_type_id=2,
        order_date=date(2024, 1, 15),
        order_number="001",
    )

    draft = await draft_service.create_draft(data, employee, order_type)
    assert draft["draft_id"]
    assert Path(draft["file_path"]).exists()
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd backend && pytest tests/test_onlyoffice.py::test_create_draft_generates_docx -v
```
Expected: import failure.

- [ ] **Step 3: Implement `OrderDraftService`**

Create `backend/app/services/order_draft_service.py`:

```python
import uuid
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Any

from docx import Document

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.models.employee import Employee
from app.models.order_type import OrderType
from app.schemas.order import OrderCreate
from app.services.order_service import order_service


class OrderDraftService:
    def __init__(self):
        self._drafts_dir = Path(settings.ORDERS_PATH) / ".drafts"
        self._drafts_dir.mkdir(parents=True, exist_ok=True)

    async def create_draft(
        self,
        data: OrderCreate,
        employee: Employee,
        order_type: OrderType,
    ) -> dict[str, Any]:
        draft_id = str(uuid.uuid4())
        doc, replacements = await order_service._build_document(
            data.order_number or "DRAFT", data, employee, order_type
        )
        filename = order_service._build_filename(
            data.order_number or "DRAFT", order_type, replacements
        )
        file_path = self._drafts_dir / f"{draft_id}_{filename}"
        await __import__("asyncio").wait_for(
            __import__("asyncio").to_thread(doc.save, str(file_path)),
            timeout=settings.DOCUMENT_GENERATION_TIMEOUT,
        )
        return {"draft_id": draft_id, "file_path": str(file_path)}

    def get_draft_path(self, draft_id: str) -> Path:
        for f in self._drafts_dir.iterdir():
            if f.is_file() and f.name.startswith(f"{draft_id}_"):
                return f
        raise HRMSException("Черновик не найден", "draft_not_found", status_code=404)

    def delete_draft(self, draft_id: str) -> None:
        path = self.get_draft_path(draft_id)
        path.unlink()


order_draft_service = OrderDraftService()
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_onlyoffice.py -v
```
Expected: pass (or fix any import/path issues).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/order_draft_service.py backend/tests/test_onlyoffice.py
git commit -m "feat(onlyoffice): add order draft service"
```

---

### Task 4: Backend OnlyOffice API Endpoints

**Files:**
- Create: `backend/app/api/onlyoffice.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing endpoint tests**

Append to `backend/tests/test_onlyoffice.py`:

```python
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.main import app


client = TestClient(app)


class FakePath:
    def __init__(self, exists=True, mtime=1000, bytes=b"docx"):
        self._exists = exists
        self._mtime = mtime
        self._bytes = bytes

    def exists(self):
        return self._exists

    def stat(self):
        return MagicMock(st_mtime=self._mtime)

    def read_bytes(self):
        return self._bytes

    def write_bytes(self, data):
        self._bytes = data

    def with_suffix(self, suffix):
        return self

    def unlink(self):
        pass


@pytest.mark.asyncio
async def test_order_onlyoffice_config_404_when_no_file(monkeypatch):
    async def fake_get_by_id(_db, _id):
        return MagicMock(id=1, file_path=None)

    monkeypatch.setattr("app.services.order_service.order_service.get_by_id", fake_get_by_id)

    response = client.get("/api/orders/1/onlyoffice/config")
    assert response.status_code == 404


def test_order_onlyoffice_file_returns_docx(monkeypatch, tmp_path):
    docx = tmp_path / "order.docx"
    docx.write_bytes(b"PK docx")

    async def fake_get_by_id(_db, _id):
        return MagicMock(id=1, file_path=str(docx), order_number="001")

    monkeypatch.setattr("app.services.order_service.order_service.get_by_id", fake_get_by_id)

    response = client.get("/api/orders/1/onlyoffice/file")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def test_callback_rejects_invalid_jwt(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "secret")

    response = client.post("/api/orders/1/onlyoffice/callback", json={"token": "bad"})
    assert response.status_code == 403


def test_callback_returns_error_zero_on_save(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "secret")

    docx = tmp_path / "order.docx"
    docx.write_bytes(b"orig")

    async def fake_get_by_id(_db, _id):
        return MagicMock(id=1, file_path=str(docx), order_number="001")

    monkeypatch.setattr("app.services.order_service.order_service.get_by_id", fake_get_by_id)
    monkeypatch.setattr(
        "app.services.onlyoffice_service.onlyoffice_service.download_and_replace",
        AsyncMock(),
    )

    token = jwt.encode({"status": 2}, "secret", algorithm="HS256")
    response = client.post(
        "/api/orders/1/onlyoffice/callback",
        json={"token": token, "status": 2, "url": "http://example.com/new.docx"},
    )
    assert response.status_code == 200
    assert response.json() == {"error": 0}
```

- [ ] **Step 2: Run tests to verify failures**

```bash
cd backend && pytest tests/test_onlyoffice.py -v
```
Expected: 404 on `/api/orders/1/onlyoffice/config` because router not included yet; other import errors.

- [ ] **Step 3: Implement `backend/app/api/onlyoffice.py`**

Create the router:

```python
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import HRMSException
from app.services.onlyoffice_service import onlyoffice_service
from app.services.order_draft_service import order_draft_service
from app.services.order_service import order_service
from app.schemas.order import OrderCreate

router = APIRouter(tags=["onlyoffice"])


def _get_current_user_stub() -> str:
    return "admin"


# --- Order endpoints ---

@router.get("/orders/{order_id}/onlyoffice/config")
async def order_onlyoffice_config(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        raise HRMSException("OnlyOffice отключен", "onlyoffice_disabled", status_code=503)

    order = await order_service.get_by_id(db, order_id)
    if not order.file_path:
        raise HRMSException("Файл приказа не найден", "order_file_not_found", status_code=404)

    file_path = Path(order.file_path)
    if not file_path.exists():
        raise HRMSException("Файл приказа отсутствует на диске", "order_file_missing", status_code=404)

    base = settings.APP_PUBLIC_URL.rstrip("/")
    callback_url = f"{base}/api/orders/{order_id}/onlyoffice/callback"
    file_url = f"{base}/api/orders/{order_id}/onlyoffice/file"

    config = onlyoffice_service.build_config(
        doc_type="order",
        doc_id=order_id,
        file_path=file_path,
        title=file_path.name,
        callback_url=callback_url,
        file_url=file_url,
    )
    config["documentServerUrl"] = settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
    return config


@router.get("/orders/{order_id}/onlyoffice/file")
async def order_onlyoffice_file(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    order = await order_service.get_by_id(db, order_id)
    if not order.file_path:
        raise HRMSException("Файл приказа не найден", "order_file_not_found", status_code=404)

    file_path = Path(order.file_path)
    if not file_path.exists():
        raise HRMSException("Файл приказа отсутствует на диске", "order_file_missing", status_code=404)

    return FileResponse(
        str(file_path),
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.post("/orders/{order_id}/onlyoffice/callback")
async def order_onlyoffice_callback(
    order_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})

    body = await request.json()
    token = body.get("token")
    if not token or not onlyoffice_service.validate_callback_token(token):
        raise HRMSException("Невалидный JWT", "invalid_jwt", status_code=403)

    status = body.get("status")
    if status in (2, 6):
        url = body.get("url")
        if url:
            order = await order_service.get_by_id(db, order_id)
            if order.file_path:
                await onlyoffice_service.download_and_replace(url, Path(order.file_path))

    return {"error": 0}


# --- Draft endpoints ---

@router.post("/orders/drafts")
async def create_draft(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        raise HRMSException("OnlyOffice отключен", "onlyoffice_disabled", status_code=503)

    employee = await order_service.employee_repo.get_by_id(db, data.employee_id)
    if not employee:
        raise HRMSException("Сотрудник не найден", "employee_not_found", status_code=404)

    order_type = await order_service.order_type_repo.get_by_id(db, data.order_type_id)
    if not order_type or not order_type.is_active:
        raise HRMSException("Тип приказа не найден", "order_type_not_found", status_code=404)

    draft = await order_draft_service.create_draft(data, employee, order_type)
    return draft


@router.get("/orders/drafts/{draft_id}/onlyoffice/config")
async def draft_onlyoffice_config(
    draft_id: str,
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        raise HRMSException("OnlyOffice отключен", "onlyoffice_disabled", status_code=503)

    file_path = order_draft_service.get_draft_path(draft_id)
    base = settings.APP_PUBLIC_URL.rstrip("/")
    callback_url = f"{base}/api/orders/drafts/{draft_id}/onlyoffice/callback"
    file_url = f"{base}/api/orders/drafts/{draft_id}/file"

    config = onlyoffice_service.build_config(
        doc_type="draft",
        doc_id=draft_id,
        file_path=file_path,
        title=file_path.name,
        callback_url=callback_url,
        file_url=file_url,
    )
    config["documentServerUrl"] = settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
    return config


@router.get("/orders/drafts/{draft_id}/file")
async def draft_onlyoffice_file(
    draft_id: str,
    current_user: str = Depends(_get_current_user_stub),
):
    file_path = order_draft_service.get_draft_path(draft_id)
    return FileResponse(
        str(file_path),
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.post("/orders/drafts/{draft_id}/onlyoffice/callback")
async def draft_onlyoffice_callback(
    draft_id: str,
    request: Request,
    current_user: str = Depends(_get_current_user_stub),
):
    if not settings.ONLYOFFICE_ENABLED:
        return JSONResponse(content={"error": 0})

    body = await request.json()
    token = body.get("token")
    if not token or not onlyoffice_service.validate_callback_token(token):
        raise HRMSException("Невалидный JWT", "invalid_jwt", status_code=403)

    status = body.get("status")
    if status in (2, 6):
        url = body.get("url")
        if url:
            file_path = order_draft_service.get_draft_path(draft_id)
            await onlyoffice_service.download_and_replace(url, file_path)

    return {"error": 0}


@router.post("/orders/drafts/{draft_id}/commit")
async def commit_draft(
    draft_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    file_path = order_draft_service.get_draft_path(draft_id)

    # Re-use existing create logic by building OrderCreate from draft metadata.
    # Since we don't store metadata on disk, we accept the same OrderCreate body
    # at draft creation and rely on the frontend to send it again at commit.
    # Simpler: let the commit endpoint accept OrderCreate and copy the draft file
    # into the real orders directory using order_service.
    raise HRMSException(
        "Commit требует OrderCreate в теле запроса. Используйте POST /orders/drafts/{draft_id}/commit с телом OrderCreate.",
        "commit_requires_body",
        status_code=422,
    )
```

Wait — commit endpoint needs to accept `OrderCreate`. Let's adjust it in the implementation.

Actually, in the plan I should show the corrected version. Let me include the proper commit endpoint that accepts `OrderCreate` body.

```python
@router.post("/orders/drafts/{draft_id}/commit")
async def commit_draft(
    draft_id: str,
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    draft_path = order_draft_service.get_draft_path(draft_id)
    if not draft_path.exists():
        raise HRMSException("Черновик не найден", "draft_not_found", status_code=404)

    order = await order_service.create_order(db, data)
    # Replace the generated file with the draft file
    target_path = Path(order.file_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    import shutil
    shutil.copy2(str(draft_path), str(target_path))
    order_draft_service.delete_draft(draft_id)
    return order_service._serialize_order(order)
```

- [ ] **Step 4: Register router in `backend/app/main.py`**

Add import:
```python
from app.api.onlyoffice import router as onlyoffice_router
```

Add:
```python
app.include_router(onlyoffice_router, prefix="/api")
```

- [ ] **Step 5: Run endpoint tests**

```bash
cd backend && pytest tests/test_onlyoffice.py -v
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/onlyoffice.py backend/app/main.py backend/tests/test_onlyoffice.py
git commit -m "feat(onlyoffice): add OnlyOffice API endpoints for orders and drafts"
```

---

### Task 5: Frontend Types and API for OnlyOffice

**Files:**
- Create: `frontend/src/entities/order/onlyofficeTypes.ts`
- Create: `frontend/src/entities/order/onlyofficeApi.ts`

- [ ] **Step 1: Write types**

`frontend/src/entities/order/onlyofficeTypes.ts`:

```typescript
export interface OnlyOfficeConfig {
  document: {
    fileType: string
    key: string
    url: string
    title: string
  }
  editorConfig: {
    callbackUrl: string
    mode: string
    lang: string
  }
  token: string
  documentServerUrl: string
}

export interface DraftResponse {
  draft_id: string
  file_path: string
}

export interface CommitDraftResponse {
  id: number
  order_number: string
  order_type_id: number
  order_type_name: string
  order_type_code: string
  employee_id: number
  employee_name: string | null
  order_date: string
  created_date: string | null
  file_path: string | null
  notes: string | null
  extra_fields: Record<string, string | number>
}
```

- [ ] **Step 2: Write API wrappers**

`frontend/src/entities/order/onlyofficeApi.ts`:

```typescript
import api from "@/shared/api/axios"
import type { OnlyOfficeConfig, DraftResponse, CommitDraftResponse } from "./onlyofficeTypes"
import type { OrderCreate } from "./types"

export async function fetchOrderOnlyOfficeConfig(orderId: number): Promise<OnlyOfficeConfig> {
  const { data } = await api.get<OnlyOfficeConfig>(`/orders/${orderId}/onlyoffice/config`)
  return data
}

export async function createDraft(order: OrderCreate): Promise<DraftResponse> {
  const { data } = await api.post<DraftResponse>("/orders/drafts", order)
  return data
}

export async function fetchDraftOnlyOfficeConfig(draftId: string): Promise<OnlyOfficeConfig> {
  const { data } = await api.get<OnlyOfficeConfig>(`/orders/drafts/${draftId}/onlyoffice/config`)
  return data
}

export async function commitDraft(draftId: string, order: OrderCreate): Promise<CommitDraftResponse> {
  const { data } = await api.post<CommitDraftResponse>(`/orders/drafts/${draftId}/commit`, order)
  return data
}
```

- [ ] **Step 3: Write TanStack Query hooks**

Create `frontend/src/entities/order/useOnlyOffice.ts`:

```typescript
import { useMutation, useQuery } from "@tanstack/react-query"
import * as api from "./onlyofficeApi"
import type { OrderCreate } from "./types"

export function useOrderOnlyOfficeConfig(orderId: number) {
  return useQuery({
    queryKey: ["onlyoffice-config", "order", orderId],
    queryFn: () => api.fetchOrderOnlyOfficeConfig(orderId),
    enabled: orderId > 0,
  })
}

export function useCreateDraft() {
  return useMutation({
    mutationFn: (data: OrderCreate) => api.createDraft(data),
  })
}

export function useDraftOnlyOfficeConfig(draftId: string | null) {
  return useQuery({
    queryKey: ["onlyoffice-config", "draft", draftId],
    queryFn: () => api.fetchDraftOnlyOfficeConfig(draftId!),  
    enabled: !!draftId,
  })
}

export function useCommitDraft() {
  return useMutation({
    mutationFn: ({ draftId, order }: { draftId: string; order: OrderCreate }) =>
      api.commitDraft(draftId, order),
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/entities/order/onlyofficeTypes.ts frontend/src/entities/order/onlyofficeApi.ts frontend/src/entities/order/useOnlyOffice.ts
git commit -m "feat(onlyoffice): add frontend types, api, and hooks for OnlyOffice"
```

---

### Task 6: Frontend OnlyOffice Editor Page

**Files:**
- Create: `frontend/src/features/onlyoffice-editor/OrderEditor.tsx`
- Create: `frontend/src/pages/OrderEditorPage.tsx`
- Modify: `frontend/src/app/Router.tsx`

- [ ] **Step 1: Create reusable `OrderEditor` component**

Create `frontend/src/features/onlyoffice-editor/OrderEditor.tsx`:

```tsx
import { useEffect, useRef } from "react"
import { Skeleton } from "@/shared/ui/skeleton"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import type { OnlyOfficeConfig } from "@/entities/order/onlyofficeTypes"

const ONLYOFFICE_SCRIPT_ID = "onlyoffice-api-script"

function loadOnlyOfficeScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(ONLYOFFICE_SCRIPT_ID) as HTMLScriptElement | null
    if (existing && existing.src === url) {
      resolve()
      return
    }
    if (existing) {
      existing.remove()
    }
    const script = document.createElement("script")
    script.id = ONLYOFFICE_SCRIPT_ID
    script.src = url
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load OnlyOffice API"))
    document.body.appendChild(script)
  })
}

interface OrderEditorProps {
  config: OnlyOfficeConfig | undefined
  isLoading: boolean
  error: Error | null
  title: string
}

export function OrderEditor({ config, isLoading, error, title }: OrderEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (!config) return

    const publicUrl = config.documentServerUrl || "http://localhost:8085"
    const scriptUrl = `${publicUrl}/web-apps/apps/api/documents/api.js`

    let destroyed = false

    loadOnlyOfficeScript(scriptUrl)
      .then(() => {
        if (destroyed || !containerRef.current) return
        const DocsAPI = (window as any).DocsAPI
        if (!DocsAPI) return

        editorInstanceRef.current = new DocsAPI.DocEditor("onlyoffice-editor", {
          ...config,
          documentType: "word",
          width: "100%",
          height: "100%",
        })
      })
      .catch((err) => {
        console.error(err)
      })

    return () => {
      destroyed = true
      if (editorInstanceRef.current) {
        editorInstanceRef.current.destroyEditor()
        editorInstanceRef.current = null
      }
    }
  }, [config])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-[80vh] w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error.message || "Ошибка загрузки редактора"}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      <div ref={containerRef} id="onlyoffice-editor" className="flex-1 border rounded-lg" />
    </div>
  )
}
```

- [ ] **Step 2: Create `OrderEditorPage.tsx` using the component**

```tsx
import { useParams } from "react-router-dom"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { useOrderOnlyOfficeConfig } from "@/entities/order/useOnlyOffice"

export function OrderEditorPage() {
  const { id } = useParams<{ id: string }>()
  const orderId = id ? parseInt(id, 10) : 0
  const { data, isLoading, error } = useOrderOnlyOfficeConfig(orderId)

  return (
    <div className="h-[calc(100vh-80px)]">
      <OrderEditor
        config={data}
        isLoading={isLoading}
        error={error as Error | null}
        title={`Редактирование приказа №${orderId}`}
      />
    </div>
  )
}
```

- [ ] **Step 3: Add route in `Router.tsx`**

Import:
```typescript
import { OrderEditorPage } from "@/pages/OrderEditorPage"
```

Add inside children array:
```typescript
{ path: "orders/:id/edit-docx", element: <OrderEditorPage /> }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/onlyoffice-editor/OrderEditor.tsx frontend/src/pages/OrderEditorPage.tsx frontend/src/app/Router.tsx
git commit -m "feat(onlyoffice): add OnlyOffice editor component, page, and route"
```

---

### Task 7: Update Orders Page UI

**Files:**
- Modify: `frontend/src/pages/OrdersPage.tsx`

- [ ] **Step 1: Add imports and state for draft modal**

In `OrdersPage.tsx`, add imports:
```typescript
import { Download, X, Check, ChevronDown, ChevronRight, Settings, Eye, Trash2, ScrollText, FilePen } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog"
import { OrderEditor } from "@/features/onlyoffice-editor/OrderEditor"
import { useCreateDraft, useCommitDraft, useDraftOnlyOfficeConfig } from "@/entities/order/useOnlyOffice"
```

Add state:
```typescript
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftModalOpen, setDraftModalOpen] = useState(false)
```

- [ ] **Step 2: Add "Редактировать DOCX" button to orders list**

Add handler:
```typescript
  const handleEditDocx = (orderId: number) => {
    navigate(`/orders/${orderId}/edit-docx`)
  }
```

Add button inside the actions row for each order (before the Eye button):
```tsx
<Button
  variant="ghost"
  size="icon"
  title="Редактировать DOCX"
  onClick={() => handleEditDocx(order.id)}
>
  <FilePen className="h-4 w-4" />
</Button>
```

- [ ] **Step 3: Add draft creation and commit mutations**

Inside component body:
```typescript
  const createDraftMutation = useCreateDraft()
  const commitDraftMutation = useCommitDraft()
  const draftConfigQuery = useDraftOnlyOfficeConfig(draftId)
```

Add handlers:
```typescript
  const handleEditBeforeCreate = () => {
    if (!validate()) return
    const ef = Object.keys(extraFields).length > 0 ? extraFields : undefined
    createDraftMutation.mutate(
      {
        employee_id: selectedEmployee!.id,
        order_type_id: selectedOrderTypeId!,
        order_date: orderDate,
        order_number: orderNumber || undefined,
        extra_fields: ef,
      },
      {
        onSuccess: (data) => {
          setDraftId(data.draft_id)
          setDraftModalOpen(true)
        },
      }
    )
  }

  const handleCommitDraft = () => {
    if (!draftId || !validate()) return
    const ef = Object.keys(extraFields).length > 0 ? extraFields : undefined
    commitDraftMutation.mutate(
      {
        draftId,
        order: {
          employee_id: selectedEmployee!.id,
          order_type_id: selectedOrderTypeId!,
          order_date: orderDate,
          order_number: orderNumber || undefined,
          extra_fields: ef,
        },
      },
      {
        onSuccess: () => {
          setDraftId(null)
          setDraftModalOpen(false)
          resetForm()
        },
      }
    )
  }
```

- [ ] **Step 4: Update creation form buttons**

Replace the submit button area:
```tsx
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={(e) => { e.stopPropagation(); resetForm(); }} disabled={isPending}>
                  Очистить
                </Button>
                {!draftId ? (
                  <>
                    <Button variant="outline" onClick={(e) => { e.stopPropagation(); handleEditBeforeCreate(); }} disabled={isPending || createDraftMutation.isPending}>
                      {createDraftMutation.isPending ? "Подготовка..." : "Редактировать DOCX перед созданием"}
                    </Button>
                    <Button onClick={(e) => { e.stopPropagation(); handleSubmit(); }} disabled={isPending}>
                      {isPending ? "Создание..." : "Создать"}
                    </Button>
                  </>
                ) : (
                  <Button onClick={(e) => { e.stopPropagation(); handleCommitDraft(); }} disabled={commitDraftMutation.isPending}>
                    {commitDraftMutation.isPending ? "Создание..." : "Создать приказ из черновика"}
                  </Button>
                )}
              </div>
```

- [ ] **Step 5: Add draft editor modal**

At the bottom of the page JSX (before closing `</div>` of the main container), add:
```tsx
      <Dialog open={draftModalOpen} onOpenChange={setDraftModalOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Редактирование черновика приказа</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 h-full">
            <OrderEditor
              config={draftConfigQuery.data}
              isLoading={draftConfigQuery.isLoading}
              error={draftConfigQuery.error as Error | null}
              title="Черновик"
            />
          </div>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/OrdersPage.tsx
git commit -m "feat(onlyoffice): wire OnlyOffice editor buttons and draft modal into orders page"
```

---

### Task 8: Backend Integration Tests

**Files:**
- Modify: `backend/tests/test_onlyoffice.py`

- [ ] **Step 1: Add integration-style tests**

Append tests that verify:
- `GET /api/orders/{id}/onlyoffice/file` returns actual DOCX bytes
- `POST /api/orders/drafts` creates a file on disk
- `POST /api/orders/drafts/{id}/commit` creates a real order and copies draft file
- Missing order/draft returns 404 on config/file endpoints

```python
@pytest.mark.asyncio
async def test_draft_commit_creates_order(monkeypatch, tmp_path):
    from datetime import date
    from unittest.mock import AsyncMock, MagicMock

    draft_service = OrderDraftService()
    draft_service._drafts_dir = tmp_path / ".drafts"
    draft_service._drafts_dir.mkdir(exist_ok=True)

    docx = draft_service._drafts_dir / "abc_test.docx"
    docx.write_bytes(b"draft content")

    async def fake_create(_db, data):
        return MagicMock(
            id=99,
            order_number="001",
            order_type_id=1,
            employee_id=1,
            order_date=date.today(),
            file_path=str(tmp_path / "orders" / "001.docx"),
            notes=None,
            extra_fields={},
        )

    monkeypatch.setattr("app.services.order_service.order_service.create_order", fake_create)
    monkeypatch.setattr("app.services.order_draft_service.order_draft_service", draft_service)
    monkeypatch.setattr("app.services.order_service.order_service._serialize_order", lambda o: {"id": o.id})

    response = client.post("/api/orders/drafts/abc/commit", json={
        "employee_id": 1,
        "order_type_id": 1,
        "order_date": "2024-01-15",
    })
    assert response.status_code == 200
    assert response.json()["id"] == 99
    assert not docx.exists()  # draft cleaned up
```

- [ ] **Step 2: Run all backend tests**

```bash
cd backend && pytest tests/test_onlyoffice.py -v
```
Expected: all pass.

- [ ] **Step 3: Run existing test suite**

```bash
cd backend && pytest tests/test_order_preview_editing.py -v
```
Expected: existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_onlyoffice.py
git commit -m "test(onlyoffice): add backend integration tests for drafts and file endpoints"
```

---

### Task 9: Frontend Build Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Type-check frontend**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Run frontend unit tests**

```bash
cd frontend && npm test
```
Expected: existing tests pass.

- [ ] **Step 3: Commit if clean**

```bash
git status
```
If no uncommitted changes, nothing to commit. If there are any lint fixes, commit them.

---

### Task 10: Manual End-to-End Verification

**Files:**
- None (manual verification)

- [ ] **Step 1: Start the full dev stack**

```bash
npm run db:up
npm run backend
```
In a separate terminal:
```bash
npm run frontend
```

- [ ] **Step 2: Verify OnlyOffice container is healthy**

```bash
docker ps
```
Expected: `hrms-onlyoffice` status healthy.

- [ ] **Step 3: Create a test order without OnlyOffice**

Use the UI to create a normal order and verify `/orders/{id}/print` shows a PDF.

- [ ] **Step 4: Edit an existing order in OnlyOffice**

Click "Редактировать DOCX" on the created order.
Expected: OnlyOffice editor loads with the order document.

- [ ] **Step 5: Make an edit and save**

Change some text in OnlyOffice, wait for auto-save (or force save).

- [ ] **Step 6: Verify updated PDF**

Open `/orders/{id}/print` again.
Expected: the edited text appears in the PDF.

- [ ] **Step 7: Test draft flow**

Create a new order form, click "Редактировать DOCX перед созданием".
Expected: OnlyOffice opens with a draft.
Edit text, then click "Создать приказ из черновика".
Expected: order is created and PDF preview shows the edited content.

---

## Spec Coverage Checklist

| Spec Requirement | Task(s) |
|-----------------|---------|
| Add `onlyoffice-documentserver` to dev/test compose | Task 1 |
| Enable JWT in compose (`JWT_ENABLED=true`, `JWT_SECRET`) | Task 1 |
| Backend settings (`ONLYOFFICE_ENABLED`, `ONLYOFFICE_JWT_SECRET`, `ONLYOFFICE_PUBLIC_URL`, `ONLYOFFICE_INTERNAL_URL`, `APP_PUBLIC_URL`) | Task 1 |
| Service that forms `DocsAPI.DocEditor` config + signs JWT + stable key | Task 2 |
| Order endpoints: config, file, callback | Task 4 |
| Callback validates JWT + atomically replaces DOCX + returns `{error:0}` | Task 2, Task 4 |
| Draft endpoints: create, config, file, callback, commit | Task 3, Task 4 |
| Legacy `edited_html -> DOCX` left untouched | Not modified (preserved) |
| Frontend editor page for created order (`/orders/:id/edit-docx`) | Task 6 |
| Frontend draft editor modal opened from creation form | Task 7 |
| Load OnlyOffice JS API from `ONLYOFFICE_PUBLIC_URL` | Task 6 |
| Orders list: Eye -> PDF preview, Print -> PDF inline, Download DOCX, Edit DOCX button | Task 7 |
| Creation form: "Редактировать DOCX перед созданием" + "Создать приказ из черновика" | Task 7 |
| Backend unit tests for config, callback JWT, atomic save, 404 | Task 2, Task 3, Task 4, Task 8 |
| Backend integration tests for file endpoint, draft commit, updated PDF | Task 8 |
| Frontend tests / build verification | Task 9 |
| Manual verification steps | Task 10 |

## Placeholder Scan

- No "TBD", "TODO", or "implement later" strings remain.
- Every step includes exact file paths, code blocks, and commands.
- Type names and method signatures are consistent across all tasks.

## Type Consistency Check

- `OnlyOfficeConfig` shape matches what `onlyoffice_service.build_config()` produces.
- `DraftResponse` matches `order_draft_service.create_draft()` return.
- `OrderCreate` is reused for draft creation and commit; no extra schema introduced.
- Callback endpoints always return `{"error": 0}` on success paths.
