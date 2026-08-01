from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.internal_notification_service import internal_notification_service


router = APIRouter(prefix="/internal-notifications", tags=["internal-notifications"])


from app.api.deps import get_current_user as _get_current_user_stub


class InternalNotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    notification_type: str
    title: str
    text: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    created_at: object
    read_at: Optional[object] = None
    closed_at: Optional[object] = None


class InternalNotificationListResponse(BaseModel):
    items: List[InternalNotificationResponse]
    total: int
    unread_count: int


@router.get("", response_model=InternalNotificationListResponse)
async def list_internal_notifications(
    limit: int = 50,
    only_unclosed: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Список уведомлений текущего пользователя: незакрытые первыми."""
    user_ids = await internal_notification_service.user_ids_by_username(
        db, [current_user.username if hasattr(current_user, "username") else str(current_user)]
    )
    user_id = user_ids[0] if user_ids else None
    if user_id is None:
        return {"items": [], "total": 0, "unread_count": 0}

    items = await internal_notification_service.list_for_user(
        db, user_id, limit=limit, only_unclosed=only_unclosed
    )
    unread = await internal_notification_service.unread_count(db, user_id)
    return {
        "items": [InternalNotificationResponse.model_validate(n) for n in items],
        "total": len(items),
        "unread_count": unread,
    }


@router.post("/{notification_id}/read", response_model=InternalNotificationResponse)
async def mark_internal_notification_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    user_ids = await internal_notification_service.user_ids_by_username(
        db, [current_user.username if hasattr(current_user, "username") else str(current_user)]
    )
    user_id = user_ids[0] if user_ids else None
    notification = await internal_notification_service.mark_read(db, notification_id, user_id or -1)
    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    return notification


@router.post("/{notification_id}/close", response_model=InternalNotificationResponse)
async def close_internal_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Закрыть уведомление — оно исчезает и больше не вернётся после
    перезагрузки страницы или входа с другой машины (#18)."""
    user_ids = await internal_notification_service.user_ids_by_username(
        db, [current_user.username if hasattr(current_user, "username") else str(current_user)]
    )
    user_id = user_ids[0] if user_ids else None
    notification = await internal_notification_service.close(db, notification_id, user_id or -1)
    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    return notification
