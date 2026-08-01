"""Тесты внутренних уведомлений интерфейса (#18)."""
from datetime import date

import pytest
from sqlalchemy import select, func

from app.models.internal_notification import InternalNotification
from app.models.user import User
from app.services.internal_notification_service import internal_notification_service
from app.services.vacation_service import vacation_service


pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _create_admin(db_session, username: str) -> User:
    user = User(
        username=username,
        full_name=username,
        role="admin",
        password_hash="x",
        is_deleted=False,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


async def test_create_for_users_with_dedup(db_session):
    user = await _create_admin(db_session, "admin_dedup")
    created = await internal_notification_service.create_for_users(
        db_session,
        [user.id],
        notification_type="absence_changed",
        title="Отпуск",
        text="Текст",
        entity_type="absence",
        entity_id=7,
    )
    assert len(created) == 1

    # Дедупликация: то же событие не создаёт второе незакрытое уведомление
    again = await internal_notification_service.create_for_users(
        db_session,
        [user.id],
        notification_type="absence_changed",
        title="Отпуск 2",
        text="Другое",
        entity_type="absence",
        entity_id=7,
    )
    assert len(again) == 1

    unclosed = await internal_notification_service.list_for_user(db_session, user.id, only_unclosed=True)
    assert len(unclosed) == 1


async def test_list_mark_read_close_flow(db_session):
    user = await _create_admin(db_session, "admin_flow")
    await internal_notification_service.create_for_users(
        db_session,
        [user.id],
        notification_type="absence_changed",
        title="Отпуск",
        entity_type="absence",
        entity_id=10,
    )
    await db_session.flush()

    items = await internal_notification_service.list_for_user(db_session, user.id)
    assert len(items) == 1
    nid = items[0].id

    assert await internal_notification_service.unread_count(db_session, user.id) == 1

    # Прочитали
    await internal_notification_service.mark_read(db_session, nid, user.id)
    assert await internal_notification_service.unread_count(db_session, user.id) == 0

    # Закрыли — исчезает из списка незакрытых
    await internal_notification_service.close(db_session, nid, user.id)
    unclosed = await internal_notification_service.list_for_user(db_session, user.id, only_unclosed=True)
    assert len(unclosed) == 0


async def test_close_persists_and_not_returned(db_session):
    """Закрытое уведомление не вернётся после «перезагрузки» (новой сессии)."""
    user = await _create_admin(db_session, "admin_reload")
    await internal_notification_service.create_for_users(
        db_session,
        [user.id],
        notification_type="absence_changed",
        title="Отпуск",
        entity_type="absence",
        entity_id=11,
    )
    await db_session.flush()
    items = await internal_notification_service.list_for_user(db_session, user.id)
    await internal_notification_service.close(db_session, items[0].id, user.id)
    await db_session.commit()

    # Другая «машина» = свежий запрос; closed_at в БД, уведомления нет
    result = await db_session.execute(
        select(func.count()).select_from(InternalNotification).where(
            InternalNotification.user_id == user.id,
            InternalNotification.closed_at.is_(None),
        )
    )
    assert result.scalar() == 0


async def test_vacation_create_notifies_admins(db_session, create_employee):
    """Создание отпуска порождает уведомление администраторам (#18)."""
    admin = await _create_admin(db_session, "admin_vac")
    emp = await create_employee(name="Отпускник", hire_date=date(2024, 1, 1))
    await vacation_service.create_vacation(
        db_session,
        {
            "employee_id": emp.id,
            "start_date": date(2026, 7, 1),
            "end_date": date(2026, 7, 5),
            "vacation_type": "Трудовой",
        },
        "tester",
    )

    items = await internal_notification_service.list_for_user(db_session, admin.id)
    assert len(items) == 1
    assert items[0].notification_type == "absence_changed"
    assert "Отпускник" in items[0].title
