from datetime import date, datetime
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


class VacationPeriodTransactionResponse(BaseModel):
    id: int
    vacation_id: Optional[int] = None
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    days_count: int
    transaction_type: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None

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
    used_days_auto: int = 0
    used_days_manual: int = 0
    order_ids: Optional[str] = None
    order_numbers: Optional[str] = None  # Номера приказов для отображения
    remaining_days: int
    vacations: list[dict] = []  # Отпуска, которые списали дни из этого периода
    transactions: list[VacationPeriodTransactionResponse] = []


class VacationPeriodAdjust(BaseModel):
    additional_days: int


class VacationPeriodUsedDays(BaseModel):
    used_days: int


class VacationPeriodBreakdown(BaseModel):
    auto: list[dict] = []
    manual_days: int = 0
