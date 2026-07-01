from datetime import date, datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field, ConfigDict


class TimesheetUnmatchedRowResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    import_id: int
    last_name: Optional[str]
    first_name: Optional[str]
    patronymic: Optional[str]
    tab_number: Optional[str]
    department_name: Optional[str]
    position_name: Optional[str]
    schedule_name: Optional[str]
    total_hours: Optional[str]
    notes: Optional[str]
    matched_employee_id: Optional[int]


class TimesheetEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    import_id: int
    employee_id: Optional[int]
    work_date: date
    presence_hours: Optional[float]
    work_hours: Optional[float]
    absence_hours: Optional[float]
    debt_hours: Optional[float]
    night_hours: Optional[float]
    overtime_hours: Optional[float]
    department_name: Optional[str]
    position_name: Optional[str]
    schedule_name: Optional[str]


class TimesheetImportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_name: str
    period_start: date
    period_end: date
    department_name: Optional[str]
    employees_total: int
    employees_matched: int
    employees_unmatched: int
    entries_imported: int
    stored_path: Optional[str]
    status: str
    notes: Optional[str]
    uploaded_at: datetime
    uploaded_by: Optional[str]
    rolled_back_at: Optional[datetime]
    rolled_back_by: Optional[str]


class TimesheetImportDetailResponse(TimesheetImportResponse):
    unmatched_rows: List[TimesheetUnmatchedRowResponse] = []


class TimesheetImportListResponse(BaseModel):
    items: List[TimesheetImportResponse]
    total: int
    page: int
    per_page: int


class TimesheetPreviewResponse(BaseModel):
    file_name: str
    department_name: Optional[str]
    period_start: Optional[date]
    period_end: Optional[date]
    employees_total: int
    employees_matched: int
    employees_unmatched: int
    matched_preview: List[Dict[str, Any]]
    unmatched: List[Dict[str, Any]]


class TimesheetConfirmRequest(BaseModel):
    """Сопоставления для несопоставленных сотрудников: {raw_key: employee_id}."""
    unmatched_assignments: Dict[str, int] = Field(default_factory=dict)


class AssignUnmatchedRequest(BaseModel):
    employee_id: int


class TimesheetCell(BaseModel):
    """Одна ячейка табеля — план/факт на день для сотрудника."""
    plan: Optional[Dict[str, Any]] = None
    fact: Optional[Dict[str, Any]] = None
    absences: List[Dict[str, Any]] = []


class TimesheetEmployeeTag(BaseModel):
    id: int
    name: str
    color: Optional[str] = None


class TimesheetEmployeeRow(BaseModel):
    id: int
    name: str
    tab_number: Optional[int]
    department_id: Optional[int]
    department_name: Optional[str] = None
    position_id: Optional[int]
    position_name: Optional[str] = None
    tags: List[TimesheetEmployeeTag] = Field(default_factory=list)
    plan: Dict[str, Dict[str, Any]] = Field(default_factory=dict)  # date.isoformat -> plan cell
    fact: Dict[str, Dict[str, Any]] = Field(default_factory=dict)  # date.isoformat -> fact cell
    absences: List[Dict[str, Any]] = []


class TimesheetResponse(BaseModel):
    period_start: date
    period_end: date
    employees: List[TimesheetEmployeeRow]
    shift_types: List[Dict[str, Any]] = Field(default_factory=list)
    holidays: List[Dict[str, Any]] = Field(default_factory=list)
