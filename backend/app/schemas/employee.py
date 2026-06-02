from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.department_graph import TagRef


class EmployeeBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    department_id: Optional[int] = None
    position_id: Optional[int] = None
    hire_date: Optional[date] = None
    birth_date: Optional[date] = None
    gender: Optional[str] = Field(None, max_length=1)
    citizenship: bool = True
    residency: bool = True
    pensioner: bool = False
    payment_form: Optional[str] = Field(None, max_length=50)
    rate: Optional[float] = None
    employment_type: Optional[str] = Field(None, max_length=50)
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    contract_number: Optional[str] = Field(None, max_length=50)
    personal_number: Optional[str] = Field(None, max_length=50)
    insurance_number: Optional[str] = Field(None, max_length=50)
    passport_number: Optional[str] = Field(None, max_length=50)
    additional_vacation_days: int = 0
    transfers: Optional[list[dict]] = []


class EmployeeCreate(EmployeeBase):
    tab_number: Optional[int] = Field(None, gt=0)

    @field_validator("birth_date")
    @classmethod
    def birth_date_not_future(cls, v: Optional[date]) -> Optional[date]:
        if v and v > date.today():
            raise ValueError("Дата рождения не может быть в будущем")
        if v and v.year < 1900:
            raise ValueError("Дата рождения не может быть раньше 1900 года")
        return v

    @model_validator(mode="after")
    def validate_dates(self):
        if self.hire_date and self.birth_date:
            min_hire = self.birth_date.replace(year=self.birth_date.year + 16)
            if self.hire_date < min_hire:
                raise ValueError("Дата приёма должна быть не раньше 16 лет")
        if self.contract_end and self.contract_start:
            if self.contract_end < self.contract_start:
                raise ValueError("Дата окончания контракта должна быть позже даты начала")
        return self


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    tab_number: Optional[int] = None
    department_id: Optional[int] = None
    position_id: Optional[int] = None
    hire_date: Optional[date] = None
    birth_date: Optional[date] = None
    gender: Optional[str] = Field(None, max_length=1)
    citizenship: Optional[bool] = None
    residency: Optional[bool] = None
    pensioner: Optional[bool] = None
    payment_form: Optional[str] = Field(None, max_length=50)
    rate: Optional[float] = None
    employment_type: Optional[str] = Field(None, max_length=50)
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    contract_number: Optional[str] = Field(None, max_length=50)
    personal_number: Optional[str] = Field(None, max_length=50)
    insurance_number: Optional[str] = Field(None, max_length=50)
    passport_number: Optional[str] = Field(None, max_length=50)
    additional_vacation_days: Optional[int] = None
    transfers: Optional[list[dict]] = None

    @field_validator("birth_date")
    @classmethod
    def birth_date_not_future(cls, v: Optional[date]) -> Optional[date]:
        if v and v > date.today():
            raise ValueError("Дата рождения не может быть в будущем")
        if v and v.year < 1900:
            raise ValueError("Дата рождения не может быть раньше 1900 года")
        return v

    @model_validator(mode="after")
    def validate_dates(self):
        if self.hire_date and self.birth_date:
            min_hire = self.birth_date.replace(year=self.birth_date.year + 16)
            if self.hire_date < min_hire:
                raise ValueError("Дата приёма должна быть не раньше 16 лет")
        if self.contract_end and self.contract_start:
            if self.contract_end < self.contract_start:
                raise ValueError("Дата окончания контракта должна быть позже даты начала")
        return self


class EmployeeDismissal(BaseModel):
    dismissal_reason: Optional[str] = Field(None, max_length=255)


class DepartmentInfo(BaseModel):
    id: int
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None

    model_config = {"from_attributes": True}


class PositionInfo(BaseModel):
    id: int
    name: str
    
    model_config = {"from_attributes": True}


class EmployeeResponse(BaseModel):
    id: int
    tab_number: Optional[int] = None
    name: str
    department_id: int
    position_id: int
    department: Optional[DepartmentInfo] = None
    position: Optional[PositionInfo] = None
    hire_date: Optional[date] = None
    birth_date: Optional[date] = None
    gender: Optional[str] = None
    citizenship: bool = True
    residency: bool = True
    pensioner: bool = False
    payment_form: Optional[str] = None
    rate: Optional[float] = None
    employment_type: Optional[str] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    contract_number: Optional[str] = None
    contract_number_locked: bool = False
    personal_number: Optional[str] = None
    insurance_number: Optional[str] = None
    passport_number: Optional[str] = None
    additional_vacation_days: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_dismissed: bool
    dismissal_date: Optional[date] = None
    dismissal_reason: Optional[str] = None
    dismissed_by: Optional[str] = None
    dismissed_at: Optional[datetime] = None
    is_deleted: bool
    periods_need_reset: Optional[bool] = None
    transfers: Optional[list[dict]] = []

    model_config = {"from_attributes": True}


class EmployeeWithTagsResponse(EmployeeResponse):
    tags: list[TagRef] = []


class EmployeeListResponse(BaseModel):
    items: list[EmployeeResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class EmployeeListWithTagsResponse(BaseModel):
    items: list[EmployeeWithTagsResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class EmployeeAuditLogResponse(BaseModel):
    id: int
    employee_id: int
    action: str
    changed_fields: Optional[dict] = None
    performed_by: Optional[str] = None
    performed_at: datetime
    reason: Optional[str] = None

    model_config = {"from_attributes": True}


class EmployeeWarningsResponse(BaseModel):
    warnings: list[str]