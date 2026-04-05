from datetime import date, datetime
from typing import Optional, Dict, Any

from pydantic import BaseModel, Field, field_validator

from app.utils.file_helpers import ORDER_TYPES


class OrderCreate(BaseModel):
    employee_id: int = Field(..., gt=0)
    order_type: str = Field(..., min_length=1, max_length=50)
    order_date: date
    order_number: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None
    extra_fields: Optional[Dict[str, Any]] = None

    @field_validator("order_type")
    @classmethod
    def order_type_valid(cls, v: str) -> str:
        if v not in ORDER_TYPES:
            raise ValueError(f"Неверный тип приказа. Допустимые: {', '.join(ORDER_TYPES)}")
        return v

    @field_validator("order_date")
    @classmethod
    def order_date_not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Дата приказа не может быть в будущем")
        return v


class OrderResponse(BaseModel):
    id: int
    order_number: str
    order_type: str
    employee_id: int
    employee_name: Optional[str] = None
    order_date: date
    created_date: Optional[datetime] = None
    file_path: Optional[str] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class OrderListResponse(BaseModel):
    items: list[OrderResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class OrderSettingsResponse(BaseModel):
    orders_path: str
    templates_path: str


class OrderSettingsUpdate(BaseModel):
    orders_path: Optional[str] = None
    templates_path: Optional[str] = None


class TemplateInfo(BaseModel):
    name: str
    order_type: str
    exists: bool
    file_size: Optional[int] = None
    last_modified: Optional[str] = None


class TemplateListResponse(BaseModel):
    templates: list[TemplateInfo]


class TemplateVariable(BaseModel):
    name: str
    description: str
    category: str


class TemplateVariablesResponse(BaseModel):
    variables: list[TemplateVariable]


class OrderSyncResponse(BaseModel):
    message: str
    deleted: int
    added: int
