from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.work_schedule import (
    WorkScheduleCreate,
    WorkScheduleUpdate,
    WorkScheduleResponse,
    WorkScheduleListResponse,
    WorkScheduleEntryCreate,
    WorkScheduleEntryResponse,
    BulkSetEntriesRequest,
)
from app.services.work_schedule_service import (
    work_schedule_service,
    WorkScheduleNotFoundError,
    WorkScheduleAlreadyExistsError,
)


router = APIRouter(prefix="/work-schedules", tags=["work-schedules"])


from app.api.deps import get_current_user as _get_current_user_stub


@router.get("", response_model=WorkScheduleListResponse)
async def list_work_schedules(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    employee_id: Optional[int] = Query(None),
    with_entries: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if employee_id:
        schedules = await work_schedule_service.list_by_employee_year(
            db, employee_id, year, with_entries=with_entries
        )
        # фильтруем по месяцу
        schedules = [s for s in schedules if s.month == month]
    else:
        schedules = await work_schedule_service.list_by_period(
            db, year, month, with_entries=with_entries
        )
    return {
        "items": [WorkScheduleResponse.model_validate(s) for s in schedules],
        "total": len(schedules),
    }


@router.get("/{schedule_id}", response_model=WorkScheduleResponse)
async def get_work_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    schedule = await work_schedule_service.get_schedule(db, schedule_id, with_entries=True)
    if not schedule:
        raise HTTPException(status_code=404, detail="График не найден")
    return WorkScheduleResponse.model_validate(schedule)


@router.post("", response_model=WorkScheduleResponse, status_code=201)
async def create_work_schedule(
    data: WorkScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        schedule = await work_schedule_service.create_schedule(
            db,
            employee_id=data.employee_id,
            year=data.year,
            month=data.month,
            current_user=current_user,
            comment=data.comment,
        )
    except WorkScheduleAlreadyExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    refreshed = await work_schedule_service.get_schedule(db, schedule.id, with_entries=True)
    return WorkScheduleResponse.model_validate(refreshed)


@router.put("/{schedule_id}", response_model=WorkScheduleResponse)
async def update_work_schedule(
    schedule_id: int,
    data: WorkScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        schedule = await work_schedule_service.update_schedule(
            db, schedule_id, data.model_dump(exclude_unset=True)
        )
    except WorkScheduleNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    refreshed = await work_schedule_service.get_schedule(db, schedule.id, with_entries=True)
    return WorkScheduleResponse.model_validate(refreshed)


@router.post("/{schedule_id}/approve", response_model=WorkScheduleResponse)
async def approve_work_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        await work_schedule_service.approve_schedule(db, schedule_id, current_user)
    except WorkScheduleNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    refreshed = await work_schedule_service.get_schedule(db, schedule_id, with_entries=True)
    return WorkScheduleResponse.model_validate(refreshed)


@router.post("/{schedule_id}/unapprove", response_model=WorkScheduleResponse)
async def unapprove_work_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        await work_schedule_service.unapprove_schedule(db, schedule_id)
    except WorkScheduleNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    refreshed = await work_schedule_service.get_schedule(db, schedule_id, with_entries=True)
    return WorkScheduleResponse.model_validate(refreshed)


@router.delete("/{schedule_id}", status_code=204)
async def delete_work_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        await work_schedule_service.delete_schedule(db, schedule_id)
    except WorkScheduleNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


# --- Entries ---

@router.post(
    "/{schedule_id}/entries",
    response_model=WorkScheduleEntryResponse,
    status_code=201,
)
async def set_work_schedule_entry(
    schedule_id: int,
    data: WorkScheduleEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        entry = await work_schedule_service.set_entry(
            db,
            schedule_id=schedule_id,
            work_date=data.work_date,
            shift_type_code=data.shift_type_code,
            planned_hours_override=data.planned_hours_override,
            note=data.note,
        )
    except WorkScheduleNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return WorkScheduleEntryResponse.model_validate(entry)


@router.post(
    "/{schedule_id}/entries/bulk",
    response_model=WorkScheduleResponse,
)
async def bulk_set_entries(
    schedule_id: int,
    data: BulkSetEntriesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        await work_schedule_service.bulk_set_entries(
            db, schedule_id, [e.model_dump() for e in data.entries]
        )
    except WorkScheduleNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    refreshed = await work_schedule_service.get_schedule(db, schedule_id, with_entries=True)
    return WorkScheduleResponse.model_validate(refreshed)


@router.delete(
    "/{schedule_id}/entries/{entry_id}",
    status_code=204,
)
async def delete_work_schedule_entry(
    schedule_id: int,
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    try:
        await work_schedule_service.delete_entry(db, entry_id)
    except WorkScheduleNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
