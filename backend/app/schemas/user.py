from pydantic import BaseModel, Field
from datetime import datetime

class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    full_name: str = Field(..., min_length=2, max_length=255)
    role: str = Field(default="admin", max_length=50)
    employee_id: int | None = None

class UserCreate(UserBase):
    # Опциональный пароль для запасного входа без SSO.
    # Если не передан — пользователь может входить только через SSO KTM-2000.
    password: str | None = Field(None, min_length=4, max_length=128)

class UserUpdate(BaseModel):
    username: str | None = Field(None, min_length=2, max_length=100)
    full_name: str | None = Field(None, min_length=2, max_length=255)
    role: str | None = Field(None, max_length=50)
    employee_id: int | None = None

class UserOut(UserBase):
    id: int
    created_at: datetime
    employee_name: str | None = None

    class Config:
        from_attributes = True
