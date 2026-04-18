from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class OrderTypeFieldSchema(BaseModel):
    key: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=200)
    type: str = Field(..., pattern="^(text|date|number|textarea)$")
    required: bool = False

    @field_validator("key")
    @classmethod
    def key_must_be_slug_like(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Ключ поля не может быть пустым")
        return normalized


class OrderTypeBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    is_active: bool = True
    show_in_orders_page: bool = True
    template_filename: str | None = Field(None, max_length=255)
    field_schema: list[OrderTypeFieldSchema] = Field(default_factory=list)
    filename_pattern: str | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("Код типа приказа не может быть пустым")
        return normalized

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Название типа приказа не может быть пустым")
        return normalized


class OrderTypeCreate(OrderTypeBase):
    pass


class OrderTypeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    is_active: bool | None = None
    show_in_orders_page: bool | None = None
    field_schema: list[OrderTypeFieldSchema] | None = None
    filename_pattern: str | None = None


class OrderTypeResponse(BaseModel):
    id: int
    code: str
    name: str
    is_active: bool
    show_in_orders_page: bool
    template_filename: str | None = None
    field_schema: list[OrderTypeFieldSchema]
    filename_pattern: str | None = None
    template_exists: bool = False
    file_size: int | None = None
    last_modified: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class OrderTypeListResponse(BaseModel):
    items: list[OrderTypeResponse]


class TemplateVariableResponse(BaseModel):
    name: str
    description: str
    category: str


class TemplateVariablesResponse(BaseModel):
    variables: list[TemplateVariableResponse]
