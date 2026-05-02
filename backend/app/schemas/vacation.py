from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class VacationCreate(BaseModel):
    employee_id: int = Field(..., gt=0)
    start_date: date
    end_date: date
    vacation_type: str = Field(..., min_length=1, max_length=50)
    order_date: Optional[date] = None
    order_number: Optional[str] = Field(None, max_length=50)
    comment: Optional[str] = Field(None, max_length=500)
    preview_id: Optional[str] = None
    edited_html: Optional[str] = None
    draft_id: Optional[str] = None


class VacationUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    vacation_type: Optional[str] = None
    comment: Optional[str] = None


class VacationResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    start_date: date
    end_date: date
    vacation_type: str
    days_count: int
    comment: Optional[str] = None
    created_at: Optional[str] = None
    order_id: Optional[int] = None
    order_number: Optional[str] = None


class VacationListResponse(BaseModel):
    items: list[VacationResponse]
    total: int
    page: int
    per_page: int


class VacationBalanceResponse(BaseModel):
    available_days: int
    used_days: int
    remaining_days: int
    vacation_type_breakdown: dict[str, int]


class PositionVacationConfigResponse(BaseModel):
    position: str
    days: int


class HolidayResponse(BaseModel):
    id: int
    date: date
    name: str
    year: int


class PositionVacationUpsert(BaseModel):
    position: str
    days: int = Field(..., ge=0)


class HolidayCreate(BaseModel):
    date: date
    name: str = Field(..., min_length=1, max_length=200)


class VacationRecallRequest(BaseModel):
    recall_date: date
    order_date: date
    order_number: Optional[str] = Field(None, max_length=50)
    comment: Optional[str] = Field(None, max_length=500)
    preview_id: Optional[str] = None
    edited_html: Optional[str] = None
    draft_id: Optional[str] = None


class VacationRecallResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    start_date: date
    end_date: date
    days_count: int
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    recall_order_id: Optional[int] = None
    recall_order_number: Optional[str] = None
