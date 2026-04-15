from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class VacationPlanBase(BaseModel):
    employee_id: int
    year: int
    month: int = Field(ge=1, le=12)
    plan_count: str
    comment: Optional[str] = None

    @field_validator('plan_count', mode='before')
    @classmethod
    def validate_plan_count(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return v
        
        if isinstance(v, (int, float)):
            v = str(v)
        if not isinstance(v, str):
            raise ValueError("plan_count должен быть строкой")
        
        v = v.strip()
        
        # Пытаемся распарсить как дробь "1/3"
        if '/' in v:
            try:
                parts = v.split('/')
                numerator = float(parts[0].strip())
                denominator = float(parts[1].strip())
                if denominator == 0:
                    raise ValueError("Знаменатель не может быть 0")
                result = numerator / denominator
                if result <= 0:
                    raise ValueError("Значение должно быть больше 0")
                return v
            except (ValueError, IndexError) as e:
                raise ValueError(f"Неверный формат дроби: {v}")
        
        # Иначе пытаемся распарсить как число
        try:
            num = float(v)
            if num <= 0:
                raise ValueError("Значение должно быть больше 0")
            return v
        except ValueError:
            raise ValueError(f"Неверный формат: {v}")


class VacationPlanCreate(VacationPlanBase):
    pass


class VacationPlanUpdate(BaseModel):
    plan_count: Optional[str] = None
    comment: Optional[str] = None

    @field_validator('plan_count', mode='before')
    @classmethod
    def validate_plan_count(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return v
        
        if isinstance(v, (int, float)):
            v = str(v)
        if not isinstance(v, str):
            raise ValueError("plan_count должен быть строкой")
        
        v = v.strip()
        
        # Пытаемся распарсить как дробь "1/3"
        if '/' in v:
            try:
                parts = v.split('/')
                numerator = float(parts[0].strip())
                denominator = float(parts[1].strip())
                if denominator == 0:
                    raise ValueError("Знаменатель не может быть 0")
                result = numerator / denominator
                if result <= 0:
                    raise ValueError("Значение должно быть больше 0")
                return v
            except (ValueError, IndexError) as e:
                raise ValueError(f"Неверный формат дроби: {v}")
        
        # Иначе пытаемся распарсить как число
        try:
            num = float(v)
            if num <= 0:
                raise ValueError("Значение должно быть больше 0")
            return v
        except ValueError:
            raise ValueError(f"Неверный формат: {v}")


class VacationPlanResponse(VacationPlanBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class VacationPlanSummary(BaseModel):
    employee_id: int
    employee_name: str
    department_id: int
    months: dict[int, Optional[str]]  # month -> plan_count
    total_plan_count: str
