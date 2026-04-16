from datetime import date
from typing import Optional, List
from pydantic import BaseModel, Field, model_validator, ConfigDict
import re

from app.models.sick_leave import SickLeaveStatus


class SickLeaveCreate(BaseModel):
    employee_id: int = Field(..., gt=0)
    start_date: date
    end_date: date
    sick_leave_type: str = Field(..., min_length=1, max_length=50)
    certificate_number: Optional[str] = Field(None, max_length=20)
    issued_by: Optional[str] = Field(None, max_length=200)
    comment: Optional[str] = Field(None, max_length=500)

    @model_validator(mode='after')
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("Дата окончания не может быть раньше даты начала")
        # Мягкая валидация формата номера больничного (6-12 цифр)
        if self.certificate_number and not re.match(r'^\d{6,12}$', self.certificate_number):
            # Не блокируем, но можно логировать предупреждение
            pass
        return self


class SickLeaveUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    sick_leave_type: Optional[str] = None
    certificate_number: Optional[str] = None
    issued_by: Optional[str] = None
    comment: Optional[str] = None

    @model_validator(mode='after')
    def validate_dates_if_present(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Дата окончания не может быть раньше даты начала")
        return self


class SickLeaveResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    employee_id: int
    employee_name: str
    start_date: date
    end_date: date
    sick_leave_type: str
    days_count: int
    certificate_number: Optional[str]
    issued_by: Optional[str]
    status: SickLeaveStatus
    created_by: int
    created_at: date
    updated_by: Optional[int]
    comment: Optional[str]


class SickLeaveListResponse(BaseModel):
    items: List[SickLeaveResponse]
    total: int
    page: int
    per_page: int
    pages: int


class SickLeaveSummary(BaseModel):
    employee_id: int
    employee_name: str
    department: Optional[str]
    total_sick_days: int
    sick_leaves_count: int
