import datetime
from typing import Optional

from pydantic import BaseModel


class NotificationCreate(BaseModel):
    title: str
    number: Optional[str] = None
    date: datetime.date
    employee_id: Optional[int] = None
    notification_type_id: Optional[int] = None
    content: Optional[str] = None
    extra_fields: Optional[dict] = None
