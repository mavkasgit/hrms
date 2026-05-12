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
    draft_id: Optional[str] = None

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
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None
    order_date: date
    created_date: Optional[datetime] = None
    file_path: Optional[str] = None
    notes: Optional[str] = None
    extra_fields: Optional[dict[str, Any]] = None
    is_group: bool = False
    group_employee_count: Optional[int] = None
    group_employees: Optional[list["GroupEmployeeInfo"]] = None

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


class OrderUpdate(BaseModel):
    order_number: str | None = Field(None, max_length=50)
    order_date: date | None = None
    notes: str | None = None
    extra_fields: dict[str, Any] | None = None


class GroupEmployeeInfo(BaseModel):
    employee_id: int
    employee_full_name: str
    position: str | None = None
    department: str | None = None
    vacation_start: str
    vacation_end: str
    vacation_days: int


# --- Generic group order schema (unified) ---

class GroupOrderCreate(BaseModel):
    """Generic schema for creating any group order draft."""
    order_type_code: str  # "vacation_unpaid_group", "weekend_call_group", etc.
    order_date: date
    order_number: str | None = Field(None, max_length=50)
    employees: list[dict[str, Any]] = Field(..., min_length=1)
    # Type-specific fields (optional, used by specific order types)
    vacation_start: date | None = None
    mode: str | None = None  # "single" or "range" for weekend_call_group
    call_date: date | None = None
    call_date_start: date | None = None
    call_date_end: date | None = None

    @field_validator("employees")
    @classmethod
    def employees_valid(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        ids = [e.get("employee_id") for e in v]
        if len(ids) != len(set(ids)):
            raise ValueError("employee_id не должны дублироваться")
        for e in v:
            if "employee_id" not in e:
                raise ValueError("Каждый сотрудник должен иметь employee_id")
            if "vacation_days" not in e:
                raise ValueError("Каждый сотрудник должен иметь vacation_days")
        return v


# --- Legacy schemas (kept for backward compatibility) ---

class VacationUnpaidGroupEmployeeCreate(BaseModel):
    employee_id: int = Field(..., gt=0)
    vacation_days: int = Field(..., gt=0)


class VacationUnpaidGroupOrderCreate(BaseModel):
    order_date: date
    order_number: str | None = Field(None, max_length=50)
    vacation_start: date
    employees: list[VacationUnpaidGroupEmployeeCreate] = Field(..., min_length=1)

    @field_validator("employees")
    @classmethod
    def employees_unique(cls, v: list[VacationUnpaidGroupEmployeeCreate]) -> list[VacationUnpaidGroupEmployeeCreate]:
        ids = [e.employee_id for e in v]
        if len(ids) != len(set(ids)):
            raise ValueError("employee_id не должны дублироваться")
        return v


class WeekendCallGroupEmployeeCreate(BaseModel):
    employee_id: int = Field(..., gt=0)
    vacation_days: int = Field(..., gt=0)


class WeekendCallGroupOrderCreate(BaseModel):
    order_date: date
    order_number: str | None = Field(None, max_length=50)
    mode: str  # "single" or "range"
    call_date: date | None = None
    call_date_start: date | None = None
    call_date_end: date | None = None
    employees: list[WeekendCallGroupEmployeeCreate] = Field(..., min_length=1)

    @field_validator("employees")
    @classmethod
    def employees_unique(cls, v: list[WeekendCallGroupEmployeeCreate]) -> list[WeekendCallGroupEmployeeCreate]:
        ids = [e.employee_id for e in v]
        if len(ids) != len(set(ids)):
            raise ValueError("employee_id не должны дублироваться")
        return v

    @field_validator("call_date_end")
    @classmethod
    def call_date_end_not_before_start(
        cls, v: date | None, info: Any
    ) -> date | None:
        if v is not None and info.data.get("call_date_start") is not None:
            if v < info.data["call_date_start"]:
                raise ValueError("Дата окончания раньше даты начала")
        return v
