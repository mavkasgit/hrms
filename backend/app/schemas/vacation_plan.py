from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class VacationPlanBase(BaseModel):
    employee_id: int
    year: int
    month: int
    days: float
    comment: Optional[str] = None


class VacationPlanCreate(VacationPlanBase):
    pass


class VacationPlanUpdate(BaseModel):
    days: Optional[float] = None
    comment: Optional[str] = None


class VacationPlanResponse(VacationPlanBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class VacationPlanSummary(BaseModel):
    employee_id: int
    employee_name: str
    department: str
    months: dict[int, Optional[float]]  # month -> days
    total_days: float
