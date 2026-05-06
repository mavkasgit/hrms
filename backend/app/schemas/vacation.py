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
    is_recalled: bool = False
    recall_date: Optional[date] = None
    recall_order_id: Optional[int] = None
    recall_order_number: Optional[str] = None
    is_postponed: bool = False
    postpone_order_id: Optional[int] = None
    postpone_order_number: Optional[str] = None
    postponed_days: Optional[int] = None
    is_extended: bool = False
    extension_order_id: Optional[int] = None
    extension_order_number: Optional[str] = None


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
    old_days_count: Optional[int] = None
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    recall_order_id: Optional[int] = None
    recall_order_number: Optional[str] = None


class VacationExtensionRequest(BaseModel):
    vacation_id: int
    order_date: date
    order_number: Optional[str] = Field(None, max_length=50)
    # Опционально: диапазон внутри отпуска (если не указан - берется весь отпуск)
    start_date: Optional[date] = Field(None, description="Начало диапазона внутри отпуска (если не указано - начало отпуска)")
    end_date: Optional[date] = Field(None, description="Конец диапазона внутри отпуска (если не указано - конец отпуска)")
    sick_start_date: date
    sick_end_date: date
    comment: Optional[str] = Field(None, max_length=500)
    draft_id: Optional[str] = None


class VacationExtensionResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    start_date: date
    end_date: date
    days_count: int
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    extension_order_id: Optional[int] = None
    extension_order_number: Optional[str] = None


class VacationPostponeRequest(BaseModel):
    vacation_id: int
    order_date: date
    order_number: Optional[str] = Field(None, max_length=50)
    # Опционально: диапазон внутри отпуска (если не указан - берется весь отпуск)
    start_date: Optional[date] = Field(None, description="Начало диапазона внутри отпуска (если не указано - начало отпуска)")
    end_date: Optional[date] = Field(None, description="Конец диапазона внутри отпуска (если не указано - конец отпуска)")
    postponed_days: int = Field(..., description="Количество дней для переноса (остальные считаются использованными)")
    comment: Optional[str] = Field(None, max_length=500)
    draft_id: Optional[str] = None


class VacationPostponeResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    start_date: date
    end_date: date
    days_count: int
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    postpone_order_id: Optional[int] = None
    postpone_order_number: Optional[str] = None
    postponed_days: int
