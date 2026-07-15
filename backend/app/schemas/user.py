from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import datetime
import re

class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: str = Field(default="viewer", max_length=50)
    employee_id: int | None = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9._-]+$", v):
            raise ValueError("Логин может содержать только латинские буквы, цифры, точки, дефисы и подчеркивания")
        return v

    @model_validator(mode="after")
    def validate_employee_or_fullname(self) -> "UserBase":
        if not self.employee_id and not self.full_name:
            raise ValueError("Необходимо указать ФИО или привязать сотрудника")
        return self

class UserCreate(UserBase):
    # Опциональный пароль для запасного входа без SSO.
    # Если не передан — пользователь может входить только через SSO KTM-2000.
    password: str | None = Field(None, min_length=4, max_length=128)
    # Admin pre-link for Telegram bot/widget login.
    telegram_id: int | None = None
    telegram_username: str | None = None
    phone: str | None = Field(None, max_length=32)
    invite_code: str | None = None

class UserUpdate(BaseModel):
    username: str | None = Field(None, min_length=2, max_length=100)
    full_name: str | None = Field(None, min_length=2, max_length=255)
    role: str | None = Field(None, max_length=50)
    employee_id: int | None = None
    # Presence in payload (incl. null) controls link/unlink via model_fields_set.
    telegram_id: int | None = None
    telegram_username: str | None = None
    phone: str | None = Field(None, max_length=32)
    invite_code: str | None = None
    # Опциональный пароль для резервного входа без SSO.
    # Если не передан — текущий пароль не изменяется.
    password: str | None = Field(None, min_length=4, max_length=128)
    # NULL = сбросить seed (фронт: legacy fallback). Новый seed — через picker.
    avatar_seed: str | None = Field(None, max_length=64)


    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str | None) -> str | None:
        if v is not None and not re.match(r"^[a-zA-Z0-9._-]+$", v):
            raise ValueError("Логин может содержать только латинские буквы, цифры, точки, дефисы и подчеркивания")
        return v

class UserOut(UserBase):
    id: int
    created_at: datetime
    employee_name: str | None = None
    telegram_id: int | None = None
    telegram_username: str | None = None
    phone: str | None = None
    phone_verified_at: datetime | None = None
    invite_code: str | None = None
    avatar_seed: str | None = None

    class Config:
        from_attributes = True


class UserPasswordSetup(BaseModel):
    password: str = Field(..., min_length=4, max_length=128)

