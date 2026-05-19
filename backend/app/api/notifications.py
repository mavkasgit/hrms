from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.core.paths import notifications_path
from app.models.employee import Employee
from app.models.notification import Notification
from app.models.notification_type import NotificationType

router = APIRouter(prefix="/notifications", tags=["notifications"])


# --- Schemas ---

class NotificationCreate(BaseModel):
    title: str
    number: Optional[str] = None
    date: date
    employee_id: Optional[int] = None
    notification_type_id: Optional[int] = None
    content: Optional[str] = None
    extra_fields: Optional[dict] = None


class NotificationUpdate(BaseModel):
    title: Optional[str] = None
    number: Optional[str] = None
    date: Optional[date] = None
    employee_id: Optional[int] = None
    notification_type_id: Optional[int] = None
    content: Optional[str] = None
    extra_fields: Optional[dict] = None


class NotificationResponse(BaseModel):
    id: int
    title: str
    number: Optional[str]
    date: date
    employee_id: Optional[int]
    employee_name: Optional[str] = None
    notification_type_id: Optional[int] = None
    notification_type_code: Optional[str] = None
    notification_type_name: Optional[str] = None
    content: Optional[str]
    extra_fields: Optional[dict] = None
    file_path: Optional[str] = None
    is_draft: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int


# --- Helpers ---

def _build_notification_response(notification: Notification, employee_name: Optional[str] = None) -> NotificationResponse:
    return NotificationResponse(
        id=notification.id,
        title=notification.title,
        number=notification.number,
        date=notification.date,
        employee_id=notification.employee_id,
        employee_name=employee_name,
        notification_type_id=notification.notification_type_id,
        notification_type_code=notification.notification_type.code if notification.notification_type else None,
        notification_type_name=notification.notification_type.name if notification.notification_type else None,
        content=notification.content,
        extra_fields=notification.extra_fields,
        file_path=notification.file_path,
        is_draft=notification.is_draft,
        created_at=str(notification.created_at) if notification.created_at else None,
        updated_at=str(notification.updated_at) if notification.updated_at else None,
    )


# --- Routes ---

@router.get("/next-number")
async def get_next_notification_number(
    db: AsyncSession = Depends(get_db),
):
    """Get the next notification number."""
    result = await db.execute(
        select(Notification.number)
        .where(Notification.number.isnot(None))
        .order_by(Notification.id.desc())
        .limit(1)
    )
    last_number = result.scalar_one_or_none()

    if not last_number:
        return {"number": "1"}

    import re
    match = re.search(r'\d+', last_number)
    last_num = int(match.group()) if match else 0
    return {"number": str(last_num + 1)}


@router.get("/", response_model=NotificationListResponse)
async def get_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=1000),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    employee_id: Optional[int] = Query(None),
    notification_type_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Notification)
        .options(joinedload(Notification.notification_type), joinedload(Notification.employee))
    )

    if date_from:
        query = query.where(Notification.date >= date_from)
    if date_to:
        query = query.where(Notification.date <= date_to)
    if employee_id:
        query = query.where(Notification.employee_id == employee_id)
    if notification_type_id:
        query = query.where(Notification.notification_type_id == notification_type_id)

    # Count
    count_query = select(func.count()).select_from(Notification)
    if date_from:
        count_query = count_query.where(Notification.date >= date_from)
    if date_to:
        count_query = count_query.where(Notification.date <= date_to)
    if employee_id:
        count_query = count_query.where(Notification.employee_id == employee_id)
    if notification_type_id:
        count_query = count_query.where(Notification.notification_type_id == notification_type_id)
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    offset = (page - 1) * per_page
    query = query.order_by(Notification.date.desc(), Notification.id.desc()).offset(offset).limit(per_page)
    result = await db.execute(query)
    notifications = list(result.unique().scalars().all())

    items = []
    for notification in notifications:
        employee_name = notification.employee.name if notification.employee else None
        items.append(_build_notification_response(notification, employee_name))

    return NotificationListResponse(items=items, total=total)


@router.post("/", response_model=NotificationResponse)
async def create_notification(
    data: NotificationCreate,
    db: AsyncSession = Depends(get_db),
):
    notification = Notification(
        title=data.title,
        number=data.number,
        date=data.date,
        employee_id=data.employee_id,
        notification_type_id=data.notification_type_id,
        content=data.content,
        extra_fields=data.extra_fields,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    result = await db.execute(
        select(Notification)
        .options(joinedload(Notification.notification_type), joinedload(Notification.employee))
        .where(Notification.id == notification.id)
    )
    notification = result.scalar_one()

    employee_name = notification.employee.name if notification.employee else None
    return _build_notification_response(notification, employee_name)


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification)
        .options(joinedload(Notification.notification_type), joinedload(Notification.employee))
        .where(Notification.id == notification_id)
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    employee_name = notification.employee.name if notification.employee else None
    return _build_notification_response(notification, employee_name)


@router.put("/{notification_id}", response_model=NotificationResponse)
async def update_notification(
    notification_id: int,
    data: NotificationUpdate,
    db: AsyncSession = Depends(get_db),
):
    notification = await db.get(Notification, notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(notification, key, value)

    await db.commit()
    await db.refresh(notification)

    result = await db.execute(
        select(Notification)
        .options(joinedload(Notification.notification_type), joinedload(Notification.employee))
        .where(Notification.id == notification.id)
    )
    notification = result.scalar_one()

    employee_name = notification.employee.name if notification.employee else None
    return _build_notification_response(notification, employee_name)


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
):
    notification = await db.get(Notification, notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    await db.delete(notification)
    await db.commit()
    return {"message": "Notification deleted"}


@router.get("/{notification_id}/download")
async def download_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
):
    notification = await db.get(Notification, notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not notification.file_path:
        raise HTTPException(status_code=404, detail="Notification file not found")
    file_path = notifications_path(notification.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Notification file not found on disk")
    return FileResponse(
        str(file_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=file_path.name,
    )
