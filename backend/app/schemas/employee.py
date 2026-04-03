from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class EmployeeBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    department: str = Field(..., min_length=1, max_length=100)
    position: str = Field(..., min_length=1, max_length=100)
    hire_date: Optional[date] = None
    birth_date: Optional[date] = None
    gender: Optional[str] = Field(None, max_length=1)
    citizenship: bool = True
    residency: bool = True
    pensioner: bool = False
    payment_form: Optional[str] = Field(None, max_length=50)
    rate: Optional[float] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    personal_number: Optional[str] = Field(None, max_length=50)
    insurance_number: Optional[str] = Field(None, max_length=50)
    passport_number: Optional[str] = Field(None, max_length=50)


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
    department: Optional[str] = Field(None, min_length=1, max_length=100)
    position: Optional[str] = Field(None, min_length=1, max_length=100)
    hire_date: Optional[date] = None
    birth_date: Optional[date] = None
    gender: Optional[str] = Field(None, max_length=1)
    citizenship: Optional[bool] = None
    residency: Optional[bool] = None
    pensioner: Optional[bool] = None
    payment_form: Optional[str] = Field(None, max_length=50)
    rate: Optional[float] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    personal_number: Optional[str] = Field(None, max_length=50)
    insurance_number: Optional[str] = Field(None, max_length=50)
    passport_number: Optional[str] = Field(None, max_length=50)

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


class EmployeeArchive(BaseModel):
    termination_reason: Optional[str] = Field(None, max_length=255)


class EmployeeResponse(BaseModel):
    id: int
    tab_number: Optional[int] = None
    name: str
    department: str
    position: str
    hire_date: Optional[date] = None
    birth_date: Optional[date] = None
    gender: Optional[str] = None
    citizenship: bool = True
    residency: bool = True
    pensioner: bool = False
    payment_form: Optional[str] = None
    rate: Optional[float] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    personal_number: Optional[str] = None
    insurance_number: Optional[str] = None
    passport_number: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_archived: bool
    terminated_date: Optional[date] = None
    termination_reason: Optional[str] = None
    archived_by: Optional[str] = None
    archived_at: Optional[datetime] = None
    is_deleted: bool

    model_config = {"from_attributes": True}


class EmployeeListResponse(BaseModel):
    items: list[EmployeeResponse]
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
