from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.vacation import (
    PositionVacationConfigResponse,
    PositionVacationUpsert,
    HolidayResponse,
    HolidayCreate,
)
from app.repositories.references_repository import references_repository

router = APIRouter(prefix="/references", tags=["references"])


def _get_current_user_stub() -> str:
    return "admin"


@router.get("/vacation-days-by-position", response_model=list[PositionVacationConfigResponse])
async def get_vacation_days_by_position(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    configs = await references_repository.get_all_position_configs(db)
    return [{"position": c.position, "days": c.days} for c in configs]


@router.put("/vacation-days-by-position/{position}", response_model=PositionVacationConfigResponse)
async def upsert_vacation_days_by_position(
    position: str,
    data: PositionVacationUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    config = await references_repository.upsert_position_config(db, position, data.days)
    return {"position": config.position, "days": config.days}


@router.delete("/vacation-days-by-position/{position}")
async def delete_vacation_days_by_position(
    position: str,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await references_repository.delete_position_config(db, position)
    return {"message": "Конфигурация удалена"}


@router.get("/holidays", response_model=list[HolidayResponse])
async def get_holidays(
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    holidays = await references_repository.get_holidays(db, year)
    return [
        {"id": h.id, "date": h.date, "name": h.name, "year": h.year}
        for h in holidays
    ]


@router.post("/holidays", response_model=HolidayResponse, status_code=201)
async def add_holiday(
    data: HolidayCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    holiday = await references_repository.add_holiday(db, data.date, data.name)
    return {"id": holiday.id, "date": holiday.date, "name": holiday.name, "year": holiday.year}


@router.delete("/holidays/{holiday_id}")
async def delete_holiday(
    holiday_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await references_repository.delete_holiday(db, holiday_id)
    return {"message": "Праздник удалён"}


@router.post("/holidays/seed")
async def seed_holidays(
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    added = await references_repository.seed_holidays_for_year(db, year)
    await db.commit()
    return {"message": f"Добавлено {added} праздников за {year} год"}
