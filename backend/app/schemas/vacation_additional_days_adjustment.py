from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

from app.schemas.vacation_period import VacationPeriodBalance


class AdditionalDaysAdjustmentResponse(BaseModel):
    id: int
    employee_id: int
    effective_from: date
    old_value: int
    new_value: int
    reason: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AdditionalDaysIncreaseRequest(BaseModel):
    """Запрос на изменение доп. дней отпуска с выбором границы применения.

    from_period:
      - "first" — применить с самого старого периода;
      - "last" — применить с самого нового существующего периода;
      - "specific" — применить с указанного периода (period_id обязателен).
    """

    new_value: int = 0
    from_period: Literal["first", "last", "specific"] = "last"
    period_id: Optional[int] = None
    reason: Optional[str] = None

    @field_validator("new_value")
    @classmethod
    def new_value_not_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Доп. дни не могут быть отрицательными")
        return v


class AdditionalDaysIncreaseResponse(BaseModel):
    adjustment: AdditionalDaysAdjustmentResponse
    periods: list[VacationPeriodBalance]