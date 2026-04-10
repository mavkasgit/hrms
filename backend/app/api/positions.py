from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.position import Position

router = APIRouter(prefix="/positions", tags=["positions"])


@router.get("")
async def list_positions(db: AsyncSession = Depends(get_db)):
    """Получить список всех должностей."""
    result = await db.execute(
        select(Position).order_by(Position.name.asc())
    )
    positions = result.scalars().all()
    return {
        "items": [{"id": p.id, "name": p.name} for p in positions]
    }
