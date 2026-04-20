from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field
from typing import Optional

from app.core.database import get_db
from app.core.logging import get_audit_logger
from app.models.position import Position
from app.models.employee import Employee

router = APIRouter(prefix="/positions", tags=["positions"])
audit_logger = get_audit_logger()

def _get_current_user_stub() -> str:
    return "admin"


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
    name: str = Field(..., min_length=1, description="Название должности")
    color: Optional[str] = None
    icon: Optional[str] = None
    sort_order: int = 0


class PositionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
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
    data: PositionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
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

    # Логирование
    audit_logger.info(
        f"POSITION CREATED: id={pos.id}, name={pos.name}",
        extra={
            "action": "position_created",
            "user_id": current_user,
            "details": {
                "position_id": pos.id,
                "position_name": pos.name,
            },
        }
    )

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
    current_user: str = Depends(_get_current_user_stub),
):
    """Обновить должность."""
    result = await db.execute(select(Position).where(Position.id == pos_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    old_data = {key: getattr(pos, key) for key in data.model_dump(exclude_unset=True).keys()}

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(pos, key, value)

    await db.commit()
    await db.refresh(pos)

    # Логирование
    audit_logger.info(
        f"POSITION UPDATED: id={pos_id}, name={pos.name}, changes={list(data.model_dump(exclude_unset=True).keys())}",
        extra={
            "action": "position_updated",
            "user_id": current_user,
            "details": {
                "position_id": pos_id,
                "position_name": pos.name,
                "old_values": old_data,
                "new_values": data.model_dump(exclude_unset=True),
            },
        }
    )

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
async def delete_position(
    pos_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Удалить должность (если нет сотрудников)."""
    result = await db.execute(select(Position).where(Position.id == pos_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    pos_name = pos.name

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

    # Логирование
    audit_logger.info(
        f"POSITION DELETED: id={pos_id}, name={pos_name}",
        extra={
            "action": "position_deleted",
            "user_id": current_user,
            "details": {
                "position_id": pos_id,
                "position_name": pos_name,
            },
        }
    )

    return {"status": "ok", "message": f"Position {pos_name} deleted"}


@router.get("/{pos_id}/usage")
async def get_position_usage(pos_id: int, db: AsyncSession = Depends(get_db)):
    """Получить количество сотрудников с данной должностью перед удалением."""
    result = await db.execute(select(Position).where(Position.id == pos_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    emp_result = await db.execute(
        select(func.count())
        .select_from(Employee)
        .where(Employee.position_id == pos_id, Employee.is_deleted == False)
    )
    emp_count = emp_result.scalar_one()

    return {"employee_count": emp_count}
