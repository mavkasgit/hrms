from datetime import date
from typing import Optional

from pydantic import BaseModel


class VacationPeriodBase(BaseModel):
    employee_id: int
    period_start: date
    period_end: date
    main_days: int = 24
    additional_days: int = 0
    year_number: int


class VacationPeriodCreate(VacationPeriodBase):
    pass


class VacationPeriodResponse(VacationPeriodBase):
    id: int
    created_at: Optional[date] = None
    updated_at: Optional[date] = None

    model_config = {"from_attributes": True}


class VacationPeriodBalance(BaseModel):
    period_id: int
    year_number: int
    period_start: date
    period_end: date
    main_days: int
    additional_days: int
    total_days: int
    used_days: int
    remaining_days: int


class VacationPeriodAdjust(BaseModel):
    additional_days: int
