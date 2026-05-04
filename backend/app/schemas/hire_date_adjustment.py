from datetime import date, datetime

from pydantic import BaseModel, Field


class HireDateAdjustmentCreate(BaseModel):
    adjustment_date: date
    reason: str = Field(..., min_length=1, max_length=500)


class HireDateAdjustmentResponse(BaseModel):
    id: int
    employee_id: int
    adjustment_date: date
    reason: str
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}
