from datetime import date
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field, ConfigDict


class WorkScheduleEntryBase(BaseModel):
    work_date: date
    shift_type_code: Optional[str] = Field(None, max_length=20)
    planned_hours_override: Optional[float] = None
    note: Optional[str] = Field(None, max_length=255)


class WorkScheduleEntryCreate(WorkScheduleEntryBase):
    pass


class WorkScheduleEntryUpdate(BaseModel):
    shift_type_code: Optional[str] = Field(None, max_length=20)
    planned_hours_override: Optional[float] = None
    note: Optional[str] = None


class WorkScheduleEntryResponse(WorkScheduleEntryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    schedule_id: int


class WorkScheduleBase(BaseModel):
    employee_id: int
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    comment: Optional[str] = None


class WorkScheduleCreate(WorkScheduleBase):
    pass


class WorkScheduleUpdate(BaseModel):
    comment: Optional[str] = None
    is_approved: Optional[bool] = None


class WorkScheduleResponse(WorkScheduleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_approved: bool
    approved_by: Optional[str]
    approved_at: Optional[date]
    created_at: Optional[date]
    created_by: Optional[str]
    updated_at: Optional[date]
    updated_by: Optional[str]
    entries: List[WorkScheduleEntryResponse] = []


class WorkScheduleListResponse(BaseModel):
    items: List[WorkScheduleResponse]
    total: int


class BulkSetEntriesRequest(BaseModel):
    entries: List[WorkScheduleEntryCreate]
