from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.core.paths import statements_path
from app.models.employee import Employee
from app.models.statement import Statement
from app.models.statement_type import StatementType

router = APIRouter(prefix="/statements", tags=["statements"])


# --- Schemas ---

class StatementCreate(BaseModel):
    title: str
    number: Optional[str] = None
    date: date
    employee_id: Optional[int] = None
    statement_type_id: Optional[int] = None
    content: Optional[str] = None
    extra_fields: Optional[dict] = None


class StatementUpdate(BaseModel):
    title: Optional[str] = None
    number: Optional[str] = None
    date: Optional[date] = None
    employee_id: Optional[int] = None
    statement_type_id: Optional[int] = None
    content: Optional[str] = None
    extra_fields: Optional[dict] = None


class StatementResponse(BaseModel):
    id: int
    title: str
    number: Optional[str]
    date: date
    employee_id: Optional[int]
    employee_name: Optional[str] = None
    statement_type_id: Optional[int] = None
    statement_type_code: Optional[str] = None
    statement_type_name: Optional[str] = None
    content: Optional[str]
    extra_fields: Optional[dict] = None
    file_path: Optional[str] = None
    is_draft: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


class StatementListResponse(BaseModel):
    items: list[StatementResponse]
    total: int


# --- Helpers ---

def _build_statement_response(statement: Statement, employee_name: Optional[str] = None) -> StatementResponse:
    return StatementResponse(
        id=statement.id,
        title=statement.title,
        number=statement.number,
        date=statement.date,
        employee_id=statement.employee_id,
        employee_name=employee_name,
        statement_type_id=statement.statement_type_id,
        statement_type_code=statement.statement_type.code if statement.statement_type else None,
        statement_type_name=statement.statement_type.name if statement.statement_type else None,
        content=statement.content,
        extra_fields=statement.extra_fields,
        file_path=statement.file_path,
        is_draft=statement.is_draft,
        created_at=str(statement.created_at) if statement.created_at else None,
        updated_at=str(statement.updated_at) if statement.updated_at else None,
    )


# --- Routes ---

@router.get("/next-number")
async def get_next_statement_number(
    db: AsyncSession = Depends(get_db),
):
    """Get the next statement number."""
    result = await db.execute(
        select(Statement.number)
        .where(Statement.number.isnot(None))
        .order_by(Statement.id.desc())
        .limit(1)
    )
    last_number = result.scalar_one_or_none()

    if not last_number:
        return {"number": "1"}

    import re
    match = re.search(r'\d+', last_number)
    last_num = int(match.group()) if match else 0
    return {"number": str(last_num + 1)}


@router.get("/", response_model=StatementListResponse)
async def get_statements(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=1000),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    employee_id: Optional[int] = Query(None),
    statement_type_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Statement)
        .options(joinedload(Statement.statement_type), joinedload(Statement.employee))
    )

    if date_from:
        query = query.where(Statement.date >= date_from)
    if date_to:
        query = query.where(Statement.date <= date_to)
    if employee_id:
        query = query.where(Statement.employee_id == employee_id)
    if statement_type_id:
        query = query.where(Statement.statement_type_id == statement_type_id)

    # Count
    count_query = select(func.count()).select_from(Statement)
    if date_from:
        count_query = count_query.where(Statement.date >= date_from)
    if date_to:
        count_query = count_query.where(Statement.date <= date_to)
    if employee_id:
        count_query = count_query.where(Statement.employee_id == employee_id)
    if statement_type_id:
        count_query = count_query.where(Statement.statement_type_id == statement_type_id)
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    offset = (page - 1) * per_page
    query = query.order_by(Statement.date.desc(), Statement.id.desc()).offset(offset).limit(per_page)
    result = await db.execute(query)
    statements = list(result.scalars().all())

    items = []
    for statement in statements:
        employee_name = statement.employee.name if statement.employee else None
        items.append(_build_statement_response(statement, employee_name))

    return StatementListResponse(items=items, total=total)


@router.post("/", response_model=StatementResponse)
async def create_statement(
    data: StatementCreate,
    db: AsyncSession = Depends(get_db),
):
    statement = Statement(
        title=data.title,
        number=data.number,
        date=data.date,
        employee_id=data.employee_id,
        statement_type_id=data.statement_type_id,
        content=data.content,
        extra_fields=data.extra_fields,
    )
    db.add(statement)
    await db.commit()
    await db.refresh(statement)

    result = await db.execute(
        select(Statement)
        .options(joinedload(Statement.statement_type), joinedload(Statement.employee))
        .where(Statement.id == statement.id)
    )
    statement = result.scalar_one()

    employee_name = statement.employee.name if statement.employee else None
    return _build_statement_response(statement, employee_name)


@router.get("/{statement_id}", response_model=StatementResponse)
async def get_statement(
    statement_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Statement)
        .options(joinedload(Statement.statement_type), joinedload(Statement.employee))
        .where(Statement.id == statement_id)
    )
    statement = result.scalar_one_or_none()
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")

    employee_name = statement.employee.name if statement.employee else None
    return _build_statement_response(statement, employee_name)


@router.put("/{statement_id}", response_model=StatementResponse)
async def update_statement(
    statement_id: int,
    data: StatementUpdate,
    db: AsyncSession = Depends(get_db),
):
    statement = await db.get(Statement, statement_id)
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(statement, key, value)

    await db.commit()
    await db.refresh(statement)

    result = await db.execute(
        select(Statement)
        .options(joinedload(Statement.statement_type), joinedload(Statement.employee))
        .where(Statement.id == statement.id)
    )
    statement = result.scalar_one()

    employee_name = statement.employee.name if statement.employee else None
    return _build_statement_response(statement, employee_name)


@router.delete("/{statement_id}")
async def delete_statement(
    statement_id: int,
    db: AsyncSession = Depends(get_db),
):
    statement = await db.get(Statement, statement_id)
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")

    await db.delete(statement)
    await db.commit()
    return {"message": "Statement deleted"}


@router.get("/{statement_id}/download")
async def download_statement(
    statement_id: int,
    db: AsyncSession = Depends(get_db),
):
    statement = await db.get(Statement, statement_id)
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    if not statement.file_path:
        raise HTTPException(status_code=404, detail="Statement file not found")
    file_path = statements_path(statement.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Statement file not found on disk")
    return FileResponse(
        str(file_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=file_path.name,
    )
