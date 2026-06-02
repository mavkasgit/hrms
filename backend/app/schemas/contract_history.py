from datetime import date, datetime

from pydantic import BaseModel


class ContractHistoryResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: str | None = None
    employee_position: str | None = None
    employee_department: str | None = None
    order_id: int | None = None
    contract_number: str | None = None
    contract_start: date
    contract_end: date | None = None
    order_type_code: str
    order_number: str | None = None
    order_date: date | None = None
    old_position: str | None = None
    new_position: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ContractHistoryListResponse(BaseModel):
    items: list[ContractHistoryResponse]
    total: int
