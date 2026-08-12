"""Провенанс draft-приказов (#104) + commit-authz admin-only (#96).

Контракт (спека #104/#96):
- commit/replay черновика приказа разрешён только аккаунту с ролью admin;
  остальные — 403 `draft_commit_forbidden` (проверка ДО любых действий, включая
  durable lookup — replay не-admin тоже 403);
- `Order.source_draft_created_by` заполняется username инициатора commit
  (actor, НЕ metadata.created_by) на single/group путях;
- отпускной флоу (create_vacation с draft_id) пишет провенанс из user_id.
"""

from datetime import date
from pathlib import Path

import pytest

from app.api.deps import CurrentUser
from app.api.onlyoffice import commit_group_order_draft, commit_order_draft
from app.core.config import settings
from app.core.exceptions import HRMSException
from app.services.order_draft_service import order_draft_service
from app.services.order_service import order_service
from app.services.vacation_service import vacation_service

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest.fixture
def _tmp_drafts_dir(tmp_path, monkeypatch):
    """Направить каталог черновиков и ORDERS_PATH в tmp_path."""
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))
    order_draft_service._drafts_dir = tmp_path / ".drafts"
    order_draft_service.ensure_drafts_dir()
    return order_draft_service._drafts_dir


@pytest.fixture
def _enable_onlyoffice(monkeypatch):
    monkeypatch.setattr(settings, "ONLYOFFICE_ENABLED", True)
    monkeypatch.setattr(settings, "ONLYOFFICE_JWT_SECRET", "test-secret")


def _make_single_draft(drafts_dir: Path, draft_id: str, order_type_id: int, order_number: str = "99-К") -> None:
    """Создать файловый черновик single_order: docx + метаданные."""
    (drafts_dir / f"{draft_id}_order.docx").write_bytes(b"draft-bytes")
    metadata = {
        "draft_id": draft_id,
        "kind": "single_order",
        "order_type_code": "general_order",
        "payload": {
            "employee_id": None,
            "order_type_id": order_type_id,
            "order_date": "2026-08-01",
            "order_number": order_number,
            "notes": None,
            "extra_fields": None,
        },
        "created_by": "different-user",
        "created_at": "2026-08-01T12:00:00+00:00",
        "status": "draft",
        "schema_version": 1,
    }
    order_draft_service.save_draft_metadata(draft_id, metadata)


def _make_group_draft(drafts_dir: Path, draft_id: str, emp_ids: list[int]) -> None:
    """Создать файловый черновик группового отпуска: docx + метаданные."""
    (drafts_dir / f"{draft_id}_vacation_unpaid_group.docx").write_bytes(b"draft-bytes")
    metadata = {
        "draft_id": draft_id,
        "kind": "group_order",
        "order_type_code": "vacation_unpaid_group",
        "payload": {
            "order_type_code": "vacation_unpaid_group",
            "order_date": date(2026, 5, 10),
            "order_number": "44-Ч",
            "vacation_start": date(2026, 5, 15),
            "employees": [{"employee_id": eid, "vacation_days": 5} for eid in emp_ids],
        },
        "created_by": "different-user",
        "created_at": "2026-05-10T12:00:00+00:00",
        "status": "draft",
        "schema_version": 1,
    }
    order_draft_service.save_draft_metadata(draft_id, metadata)


def _make_vacation_draft(drafts_dir: Path, draft_id: str, order_type_id: int, employee_id: int) -> None:
    """Файловый черновик vacation_paid: docx + метаданные."""
    (drafts_dir / f"{draft_id}_order.docx").write_bytes(b"draft-bytes")
    metadata = {
        "draft_id": draft_id,
        "kind": "single_order",
        "order_type_code": "vacation_paid",
        "payload": {
            "employee_id": employee_id,
            "order_type_id": order_type_id,
            "order_date": "2026-08-01",
            "order_number": "V-777",
            "notes": None,
            "extra_fields": {"vacation_start": "2026-08-10", "vacation_end": "2026-08-20"},
        },
        "created_by": "different-user",
        "created_at": "2026-08-01T12:00:00+00:00",
        "status": "draft",
        "schema_version": 1,
    }
    order_draft_service.save_draft_metadata(draft_id, metadata)


# === #96: commit-authz admin-only ===


async def test_single_commit_non_admin_forbidden(db_session, _tmp_drafts_dir, _enable_onlyoffice):
    """Commit single-draft от role=viewer → 403 draft_commit_forbidden, приказ не создан."""
    await order_service.ensure_default_order_types(db_session)
    general_type = await order_service.get_order_type_by_code(db_session, "general_order")
    draft_id = "aaaa0001-aaaa-bbbb-cccc-111111111111"
    _make_single_draft(_tmp_drafts_dir, draft_id, general_type.id)

    with pytest.raises(HRMSException) as exc_info:
        await commit_order_draft(
            draft_id=draft_id,
            db=db_session,
            current_user=CurrentUser("viewer-user", role="viewer"),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.error_code == "draft_commit_forbidden"
    assert await order_service.find_by_source_draft_id(db_session, draft_id) is None
    # Черновик не тронут: commit не дошёл до claim/create.
    assert (_tmp_drafts_dir / f"{draft_id}_order.docx").exists()


async def test_group_commit_non_admin_forbidden(db_session, _tmp_drafts_dir, _enable_onlyoffice, create_employee):
    """Commit group-draft от role=viewer → 403 draft_commit_forbidden."""
    await order_service.ensure_default_order_types(db_session)
    emp1 = await create_employee()
    emp2 = await create_employee()
    draft_id = "aaaa0002-aaaa-bbbb-cccc-222222222222"
    _make_group_draft(_tmp_drafts_dir, draft_id, [emp1.id, emp2.id])

    with pytest.raises(HRMSException) as exc_info:
        await commit_group_order_draft(
            draft_id=draft_id,
            db=db_session,
            current_user=CurrentUser("viewer-user", role="viewer"),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.error_code == "draft_commit_forbidden"


async def test_replay_non_admin_forbidden_even_when_order_exists(
    db_session, _tmp_drafts_dir, _enable_onlyoffice
):
    """Проверка admin-only стоит ДО durable lookup: replay не-admin → 403 даже при
    существующем Order (не даём узнать о приказе и не возвращаем его)."""
    await order_service.ensure_default_order_types(db_session)
    general_type = await order_service.get_order_type_by_code(db_session, "general_order")
    draft_id = "aaaa0003-aaaa-bbbb-cccc-333333333333"
    _make_single_draft(_tmp_drafts_dir, draft_id, general_type.id)

    admin = CurrentUser("alice", role="admin")
    first = await commit_order_draft(draft_id=draft_id, db=db_session, current_user=admin)
    assert first["id"] > 0

    with pytest.raises(HRMSException) as exc_info:
        await commit_order_draft(
            draft_id=draft_id,
            db=db_session,
            current_user=CurrentUser("viewer-user", role="viewer"),
        )
    assert exc_info.value.status_code == 403
    assert exc_info.value.error_code == "draft_commit_forbidden"


# === #104: провенанс source_draft_created_by ===


async def test_single_commit_provenance_from_actor(db_session, _tmp_drafts_dir, _enable_onlyoffice):
    """source_draft_created_by == username actor, НЕ metadata.created_by."""
    await order_service.ensure_default_order_types(db_session)
    general_type = await order_service.get_order_type_by_code(db_session, "general_order")
    draft_id = "aaaa0004-aaaa-bbbb-cccc-444444444444"
    _make_single_draft(_tmp_drafts_dir, draft_id, general_type.id)

    result = await commit_order_draft(
        draft_id=draft_id,
        db=db_session,
        current_user=CurrentUser("alice", role="admin"),
    )

    order = await order_service.find_by_source_draft_id(db_session, draft_id)
    assert order is not None
    assert order.id == result["id"]
    assert order.source_draft_created_by == "alice"
    assert order.source_draft_created_by != "different-user"


async def test_group_commit_provenance_from_actor(
    db_session, _tmp_drafts_dir, _enable_onlyoffice, create_employee
):
    """source_draft_created_by заполнен на групповом commit."""
    await order_service.ensure_default_order_types(db_session)
    emp1 = await create_employee()
    emp2 = await create_employee()
    draft_id = "aaaa0005-aaaa-bbbb-cccc-555555555555"
    _make_group_draft(_tmp_drafts_dir, draft_id, [emp1.id, emp2.id])

    await commit_group_order_draft(
        draft_id=draft_id,
        db=db_session,
        current_user=CurrentUser("boss", role="admin"),
    )

    order = await order_service.find_by_source_draft_id(db_session, draft_id)
    assert order is not None
    assert order.is_group is True
    assert order.source_draft_created_by == "boss"


async def test_create_vacation_with_draft_id_writes_provenance(
    db_session, create_employee, monkeypatch, tmp_path
):
    """create_vacation с draft_id → связанный приказ несёт source_draft_created_by == user_id."""
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))
    order_draft_service._drafts_dir = tmp_path / ".drafts"
    order_draft_service.ensure_drafts_dir()

    employee = await create_employee(hire_date=date(2024, 1, 15))
    paid_type = await order_service.get_order_type_by_code(db_session, "vacation_paid")
    draft_id = "aaaa0006-aaaa-bbbb-cccc-666666666666"
    _make_vacation_draft(order_draft_service._drafts_dir, draft_id, paid_type.id, employee.id)

    created = await vacation_service.create_vacation(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 8, 10),
            "end_date": date(2026, 8, 20),
            "vacation_type": "Трудовой",
            "draft_id": draft_id,
        },
        "vacation-creator",
    )

    order = await order_service.find_by_source_draft_id(db_session, draft_id)
    assert order is not None
    assert order.id == created["order_id"]
    assert order.source_draft_created_by == "vacation-creator"
