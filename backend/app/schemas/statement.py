import datetime
from typing import Optional

from pydantic import BaseModel


class StatementCreate(BaseModel):
    title: str
    number: Optional[str] = None
    date: datetime.date
    employee_id: Optional[int] = None
    statement_type_id: Optional[int] = None
    content: Optional[str] = None
    extra_fields: Optional[dict] = None
