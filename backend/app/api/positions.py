from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.position import Position
from app.models.employee import Employee

router = APIRouter(prefix="/positions", tags=["positions"])


class PositionResponse(BaseModel):
    id: int
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    sort_order: int
    employee_count: int = 0

    class Config:
        from_attributes = True


class PositionCreate(BaseModel):
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    sort_order: int = 0


class PositionUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None


@router.get("", response_model=list[PositionResponse])
async def list_positions(db: AsyncSession = Depends(get_db)):
    """Получить список всех должностей с количеством сотрудников."""
    result = await db.execute(
        select(Position).order_by(Position.sort_order, Position.name)
    )
    positions = result.scalars().all()

    # Считаем сотрудников для каждой должности
    result = await db.execute(
        select(
            Employee.position_id,
            func.count().label("cnt"),
        )
        .where(Employee.is_deleted == False, Employee.is_archived == False)
        .group_by(Employee.position_id)
    )
    counts = {row.position_id: row.cnt for row in result.all()}

    return [
        PositionResponse(
            id=p.id,
            name=p.name,
            color=p.color,
            icon=p.icon,
            sort_order=p.sort_order,
            employee_count=counts.get(p.id, 0),
        )
        for p in positions
    ]


@router.post("", response_model=PositionResponse)
async def create_position(
    data: PositionCreate, db: AsyncSession = Depends(get_db)
):
    """Создать должность."""
    pos = Position(
        name=data.name,
        color=data.color,
        icon=data.icon,
        sort_order=data.sort_order,
    )
    db.add(pos)
    await db.flush()
    await db.refresh(pos)
    
    # Считаем сотрудников
    result = await db.execute(
        select(func.count())
        .select_from(Employee)
        .where(
            Employee.position_id == pos.id,
            Employee.is_deleted == False,
            Employee.is_archived == False,
        )
    )
    count = result.scalar_one()

    return PositionResponse(
        id=pos.id,
        name=pos.name,
        color=pos.color,
        icon=pos.icon,
        sort_order=pos.sort_order,
        employee_count=count,
    )


@router.patch("/{pos_id}", response_model=PositionResponse)
async def update_position(
    pos_id: int,
    data: PositionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Обновить должность."""
    result = await db.execute(select(Position).where(Position.id == pos_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(pos, key, value)

    await db.commit()
    await db.refresh(pos)

    # Пересчитываем сотрудников
    result = await db.execute(
        select(func.count())
        .select_from(Employee)
        .where(
            Employee.position_id == pos_id,
            Employee.is_deleted == False,
            Employee.is_archived == False,
        )
    )
    count = result.scalar_one()

    return PositionResponse(
        id=pos.id,
        name=pos.name,
        color=pos.color,
        icon=pos.icon,
        sort_order=pos.sort_order,
        employee_count=count,
    )


@router.delete("/{pos_id}")
async def delete_position(pos_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить должность (если нет сотрудников)."""
    result = await db.execute(select(Position).where(Position.id == pos_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    # Проверяем сотрудников
    emp_result = await db.execute(
        select(Employee)
        .where(Employee.position_id == pos_id, Employee.is_deleted == False)
    )
    employees = emp_result.scalars().all()
    if employees:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete position with active employees",
        )

    await db.delete(pos)
    await db.commit()
    return {"ok": True}
