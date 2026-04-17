from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.sick_leave import (
    SickLeaveCreate,
    SickLeaveUpdate,
    SickLeaveResponse,
    SickLeaveListResponse,
    SickLeaveSummary,
)
from app.services.sick_leave_service import sick_leave_service
from app.models.sick_leave import SickLeaveStatus


router = APIRouter(prefix="/sick-leaves", tags=["sick_leaves"])


def _get_current_user_stub() -> str:
    """Заглушка для получения текущего пользователя. TODO: заменить на реальную авторизацию."""
    return "admin"


@router.get("/stats/employees", response_model=list[SickLeaveSummary])
async def get_employees_summary(
    q: Optional[str] = Query(None),
    filter: str = Query("active", alias="filter"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """
    Получить сводку по больничным для всех сотрудников.

    - **q**: Поиск по ФИО или табельному номеру
    - **filter**: Фильтр (active, archived, all)
    """
    include_archived = filter in ("archived", "all")
    return await sick_leave_service.get_employees_summary(
        db, search_query=q, include_archived=include_archived
    )


@router.get("", response_model=SickLeaveListResponse)
async def get_sick_leaves(
    q: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """
    Получить список больничных с фильтрацией и пагинацией.

    - **q**: Поиск по ФИО сотрудника
    - **status**: Статус (active, cancelled, deleted)
    - **page**: Номер страницы
    - **per_page**: Количество записей на странице
    """
    # Преобразуем статус из строки в Enum
    status_enum = None
    if status:
        try:
            status_enum = SickLeaveStatus(status)
        except ValueError:
            pass  # Игнорируем невалидный статус

    result = await sick_leave_service.get_sick_leaves_list(
        db=db,
        search_query=q,
        status=status_enum,
        page=page,
        per_page=per_page,
    )

    return result


@router.post("", response_model=SickLeaveResponse, status_code=201)
async def create_sick_leave(
    data: SickLeaveCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """
    Создать запись о больничном.

    Требуемые поля:
    - **employee_id**: ID сотрудника
    - **start_date**: Дата начала
    - **end_date**: Дата окончания
    """
    try:
        result = await sick_leave_service.create_sick_leave(
            db, data.model_dump(), current_user
        )
        return result
    except Exception as e:
        import logging

        logging.error(f"[create_sick_leave] ERROR: {e}", exc_info=True)
        raise


@router.get("/{sick_leave_id}", response_model=SickLeaveResponse)
async def get_sick_leave(
    sick_leave_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Получить информацию о больничном по ID."""
    return await sick_leave_service.get_sick_leave(db, sick_leave_id)


@router.put("/{sick_leave_id}", response_model=SickLeaveResponse)
async def update_sick_leave(
    sick_leave_id: int,
    data: SickLeaveUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """
    Обновить запись о больничном.

    Можно обновлять:
    - Даты начала и окончания
    - Комментарий
    """
    result = await sick_leave_service.update_sick_leave(
        db, sick_leave_id, data.model_dump(exclude_unset=True), current_user
    )
    return result


@router.delete("/{sick_leave_id}")
async def delete_sick_leave(
    sick_leave_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """
    Мягко удалить больничный (установить статус DELETED).
    Восстановление невозможно.
    """
    await sick_leave_service.delete_sick_leave(db, sick_leave_id, current_user)
    return {"message": "Больничный удалён"}


@router.put("/{sick_leave_id}/cancel")
async def cancel_sick_leave(
    sick_leave_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """
    Отменить активный больничный.
    Можно отменить только больничный со статусом ACTIVE.
    """
    result = await sick_leave_service.cancel_sick_leave(db, sick_leave_id, current_user)
    return {"message": "Больничный отменён", "data": result}
