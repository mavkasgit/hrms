from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _get_current_user_stub() -> str:
    return "admin"


@router.get("/dashboard")
async def get_dashboard_stats(
    department: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await AnalyticsService.get_dashboard_stats(db, department, gender)


@router.get("/birthdays")
async def get_upcoming_birthdays(
    days: int = Query(30, ge=1, le=365),
    gender: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await AnalyticsService.get_upcoming_birthdays(db, days, gender)


@router.get("/contracts")
async def get_contract_expiring(
    department: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await AnalyticsService.get_contract_expiring(db, department, gender)


@router.get("/departments")
async def get_department_distribution(
    department: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await AnalyticsService.get_department_distribution(db, department, gender)
