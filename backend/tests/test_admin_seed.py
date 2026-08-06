"""Тесты авто-сида администратора (OIDC-вход не должен падать на 403)."""
import pytest
from sqlalchemy import select

from app.models.user import User
from app.services.admin_seed_service import ensure_default_admin

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_seed_creates_admin_when_none_exists(db_session):
    created = await ensure_default_admin(db_session)

    assert created is not None
    assert created.role == "admin"
    assert created.is_active is True
    assert created.is_deleted is False

    stored = (
        await db_session.execute(select(User).where(User.role == "admin"))
    ).scalars().all()
    assert len(stored) == 1
    assert stored[0].id == created.id


async def test_seed_is_idempotent(db_session):
    first = await ensure_default_admin(db_session)
    second = await ensure_default_admin(db_session)

    assert first is not None
    assert second is None
    admins = (await db_session.execute(select(User).where(User.role == "admin"))).scalars().all()
    assert len(admins) == 1


async def test_seed_does_nothing_when_admin_exists(db_session):
    from app.core.config import settings

    admin = User(
        username="boss",
        role="admin",
        full_name="Босс",
        is_active=True,
        is_deleted=False,
    )
    db_session.add(admin)
    await db_session.commit()

    result = await ensure_default_admin(db_session)
    assert result is None
    assert (await db_session.execute(select(User).where(User.username == settings.ADMIN_SEED_USERNAME))).scalar_one_or_none() is None


async def test_seed_does_not_escalate_occupied_username(db_session):
    from app.core.config import settings

    viewer = User(
        username=settings.ADMIN_SEED_USERNAME,
        role="viewer",
        full_name="Занятый логин",
        is_active=True,
        is_deleted=False,
    )
    db_session.add(viewer)
    await db_session.commit()

    result = await ensure_default_admin(db_session)
    assert result is None
    stored = (await db_session.execute(select(User).where(User.username == settings.ADMIN_SEED_USERNAME))).scalar_one()
    assert stored.role == "viewer"
