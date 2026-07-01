from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.timesheet import (
    TimesheetImportListResponse,
    TimesheetImportResponse,
    TimesheetImportDetailResponse,
    TimesheetUnmatchedRowResponse,
    TimesheetPreviewResponse,
    TimesheetConfirmRequest,
    TimesheetResponse,
    AssignUnmatchedRequest,
)
from app.services.timesheet_service import (
    timesheet_import_service,
    TimesheetImportNotFoundError,
)


router = APIRouter(prefix="/timesheet", tags=["timesheet"])


from app.api.deps import get_current_user as _get_current_user_stub


# --- Импорт ---

@router.post("/imports/preview", response_model=TimesheetPreviewResponse)
async def preview_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Только .xlsx или .xls файлы")
    content = await file.read()
    try:
        result = await timesheet_import_service.preview_import(db, content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return result


@router.post(
    "/imports/confirm",
    response_model=TimesheetImportResponse,
    status_code=201,
)
async def confirm_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
    unmatched_assignments: Optional[str] = Form(None),
):
    """Подтверждает импорт. unmatched_assignments — JSON-строка формата {"key": employee_id}."""
    import json as _json
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Только .xlsx или .xls файлы")
    content = await file.read()
    parsed_assignments: dict = {}
    if unmatched_assignments:
        try:
            parsed_assignments = _json.loads(unmatched_assignments)
        except _json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Некорректный JSON в unmatched_assignments")
    try:
        record = await timesheet_import_service.confirm_import(
            db, content, file.filename, current_user, parsed_assignments
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return TimesheetImportResponse.model_validate(record)


@router.get("/imports", response_model=TimesheetImportListResponse)
async def list_imports(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    period_start: Optional[date] = Query(None),
    period_end: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    offset = (page - 1) * per_page
    items, total = await timesheet_import_service.list_imports(
        db, limit=per_page, offset=offset, period_start=period_start, period_end=period_end
    )
    return {
        "items": [TimesheetImportResponse.model_validate(i) for i in items],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/imports/{import_id}", response_model=TimesheetImportDetailResponse)
async def get_import(
    import_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        record = await timesheet_import_service.get_import(db, import_id, with_entries=False)
    except TimesheetImportNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    unmatched = await timesheet_import_service.get_unmatched(db, import_id)
    return TimesheetImportDetailResponse(
        **TimesheetImportResponse.model_validate(record).model_dump(),
        unmatched_rows=[TimesheetUnmatchedRowResponse.model_validate(r) for r in unmatched],
    )


@router.post(
    "/imports/{import_id}/unmatched/{row_id}/assign",
    response_model=TimesheetUnmatchedRowResponse,
)
async def assign_unmatched(
    import_id: int,
    row_id: int,
    data: AssignUnmatchedRequest,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        row = await timesheet_import_service.assign_unmatched(
            db, import_id, row_id, data.employee_id, current_user
        )
    except TimesheetImportNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return TimesheetUnmatchedRowResponse.model_validate(row)


@router.post(
    "/imports/{import_id}/rollback",
    response_model=TimesheetImportResponse,
)
async def rollback_import(
    import_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        record = await timesheet_import_service.rollback_import(db, import_id, current_user)
    except TimesheetImportNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return TimesheetImportResponse.model_validate(record)


# --- Чтение табеля ---

@router.get("", response_model=TimesheetResponse)
async def get_timesheet(
    period_start: date = Query(...),
    period_end: date = Query(...),
    department_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if period_end < period_start:
        raise HTTPException(status_code=400, detail="period_end должен быть не раньше period_start")
    data = await timesheet_import_service.get_timesheet(
        db, period_start, period_end, department_id=department_id
    )
    return data


@router.get("/grid", response_model=TimesheetResponse)
async def get_timesheet_grid(
    period_start: date = Query(...),
    period_end: date = Query(...),
    department_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if period_end < period_start:
        raise HTTPException(status_code=400, detail="period_end должен быть не раньше period_start")
    return await timesheet_import_service.get_timesheet_grid(
        db, period_start, period_end, department_id=department_id
    )
