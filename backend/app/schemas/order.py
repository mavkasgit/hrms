from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class OrderCreate(BaseModel):
    employee_id: int = Field(..., gt=0)
    order_type_id: int = Field(..., gt=0)
    order_date: date
    order_number: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None
    extra_fields: Optional[dict[str, Any]] = None

    @field_validator("order_date")
    @classmethod
    def order_date_not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Дата приказа не может быть в будущем")
        return v


class OrderResponse(BaseModel):
    id: int
    order_number: str
    order_type_id: int
    order_type_name: str
    order_type_code: str
    employee_id: int
    employee_name: Optional[str] = None
    order_date: date
    created_date: Optional[datetime] = None
    file_path: Optional[str] = None
    notes: Optional[str] = None
    extra_fields: Optional[dict[str, Any]] = None

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


class OrderSyncResponse(BaseModel):
    message: str
    deleted: int
    added: int
