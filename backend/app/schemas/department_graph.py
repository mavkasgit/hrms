"""Pydantic-схемы для графа подразделений (Nodes & Edges формат)."""
from pydantic import BaseModel
from typing import Optional


# --- Теги ---

class TagRef(BaseModel):
    """Минимальная ссылка на тег."""
    id: int
    name: str
    color: Optional[str] = None

    class Config:
        from_attributes = True


# --- Сотрудники в узле графа ---

class GraphEmployee(BaseModel):
    """Сотрудник для отображения в узле графа."""
    id: int
    name: str
    position_name: Optional[str] = None
    tags: list[TagRef] = []

    class Config:
        from_attributes = True


# --- Узел графа (подразделение) ---

class GraphNode(BaseModel):
    """Узел графа — подразделение."""
    id: int
    name: str
    short_name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    rank: int = 1
    head_employee_id: Optional[int] = None
    head_employee_name: Optional[str] = None
    tags: list[TagRef] = []
    employee_count: int = 0
    employees: list[GraphEmployee] = []

    class Config:
        from_attributes = True


# --- Ребро графа (связь между подразделениями) ---

class GraphEdge(BaseModel):
    """Ребро графа — связь между двумя подразделениями."""
    head_id: int
    child_id: int
    relation_type: str  # vertical, matrix, horizontal

    class Config:
        from_attributes = True


# --- Ответ графа целиком ---

class DepartmentGraphResponse(BaseModel):
    """Полный ответ графа подразделений."""
    nodes: list[GraphNode]
    edges: list[GraphEdge]


# --- Схемы для CRUD ---

class DepartmentLinkCreate(BaseModel):
    """Создание связи между подразделениями."""
    child_id: int
    relation_type: str = "vertical"  # vertical, matrix, horizontal


class DepartmentLinkResponse(BaseModel):
    """Ответ при создании/получении связи."""
    head_id: int
    child_id: int
    relation_type: str

    class Config:
        from_attributes = True


class DepartmentTagAssign(BaseModel):
    """Привязка тега к подразделению."""
    tag_id: int


class DepartmentTagResponse(BaseModel):
    """Ответ при привязке тега."""
    department_id: int
    tag_id: int

    class Config:
        from_attributes = True
