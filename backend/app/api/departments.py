from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.department import Department

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("")
async def list_departments(db: AsyncSession = Depends(get_db)):
    """Получить список всех подразделений."""
    result = await db.execute(
        select(Department).order_by(Department.name.asc())
    )
    departments = result.scalars().all()
    return {
        "items": [{"id": d.id, "name": d.name} for d in departments]
    }
