"""Идемпотентный commit приказа из черновика (#94 single, #95 group).

Контракт (ADR-0009, спеки #94/#95):
- повторный commit → 200 с тем же сериализованным Order (не duplicate-message);
- `source_draft_id` пишется на Order из draft-пути (single и group);
- crash-recovery: stale lock + существующий Order → 200 с тем же Order, lock убран;
- stale lock без Order → commit перезабирает lock и создаёт Order;
- IntegrityError (дубликат UNIQUE) → rollback + durable lookup → возвращается
  существующий Order, файл существующего приказа не удаляется;
- group: падение вставки OrderEmployee → all-or-nothing (в БД нет строки orders
  для draft), lock снят, черновик не consumed (replay возможен).
"""

from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser
from app.api.onlyoffice import commit_group_order_draft, commit_order_draft
from app.core.config import settings
from app.schemas.order import OrderCreate
from app.services import draft_adapter as draft_adapter_module
from app.services import order_service as order_service_module
from app.services.order_draft_service import order_draft_service
from app.services.order_service import OrderService, order_service

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
        "created_by": "admin",
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
        "created_by": "admin",
        "created_at": "2026-05-10T12:00:00+00:00",
        "status": "draft",
        "schema_version": 1,
    }
    order_draft_service.save_draft_metadata(draft_id, metadata)


# === #94: single ===


class _PgErrorWithDiag(Exception):
    """Имитация psycopg2-ошибки: `orig.diag.constraint_name` (#105)."""

    def __init__(self, message: str, constraint_name: str | None):
        super().__init__(message)
        self.diag = SimpleNamespace(constraint_name=constraint_name)


def _integrity_error_with_constraint(constraint_name: str) -> IntegrityError:
    """IntegrityError с `orig.diag.constraint_name` (реальный psycopg2-кейс)."""
    return IntegrityError("INSERT orders", {}, _PgErrorWithDiag("duplicate key", constraint_name))


def _integrity_error_without_diag(message: str) -> IntegrityError:
    """IntegrityError без `orig.diag` — fallback по строке (не-psycopg2 драйвер/тест)."""
    return IntegrityError("INSERT orders", {}, Exception(message))


async def test_single_repeated_commit_returns_same_order(db_session, _tmp_drafts_dir, _enable_onlyoffice):
    """Два последовательных commit одного single-draft → 200 с одним и тем же order_id."""
    await order_service.ensure_default_order_types(db_session)
    general_type = await order_service.get_order_type_by_code(db_session, "general_order")
    draft_id = "11111111-aaaa-bbbb-cccc-111111111111"
    _make_single_draft(_tmp_drafts_dir, draft_id, general_type.id)

    first = await commit_order_draft(draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin"))
    second = await commit_order_draft(draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin"))

    assert second["id"] == first["id"]
    assert first["order_number"] == "99-К"
    assert "duplicate" not in second


async def test_source_draft_id_written_single(db_session, _tmp_drafts_dir, _enable_onlyoffice):
    """После commit `Order.source_draft_id == draft_id` (из URL-параметра)."""
    await order_service.ensure_default_order_types(db_session)
    general_type = await order_service.get_order_type_by_code(db_session, "general_order")
    draft_id = "22222222-aaaa-bbbb-cccc-222222222222"
    _make_single_draft(_tmp_drafts_dir, draft_id, general_type.id)

    result = await commit_order_draft(draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin"))

    order = await order_service.find_by_source_draft_id(db_session, draft_id)
    assert order is not None
    assert order.source_draft_id == draft_id
    assert order.id == result["id"]


async def test_crash_recovery_stale_lock_with_order(
    db_session, _tmp_drafts_dir, _enable_onlyoffice, create_order
):
    """Процесс умер между INSERT Order и cleanup: stale lock + существующий Order.

    Повторный commit → 200 с тем же заказом, stale lock удалён.
    """
    draft_id = "44444444-aaaa-bbbb-cccc-444444444444"
    existing = await create_order(source_draft_id=draft_id)
    existing_id = existing.id
    lock_path = _tmp_drafts_dir / f"{draft_id}.commit.lock"
    lock_path.write_bytes(b"1")

    result = await commit_order_draft(draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin"))

    assert result["id"] == existing_id
    assert not lock_path.exists(), "stale commit lock must be removed"


async def test_stale_lock_without_order_recovery(
    db_session, _tmp_drafts_dir, _enable_onlyoffice, monkeypatch
):
    """Stale lock без заказа → commit перезабирает lock, создаёт Order и снимает lock."""
    await order_service.ensure_default_order_types(db_session)
    general_type = await order_service.get_order_type_by_code(db_session, "general_order")
    draft_id = "55555555-aaaa-bbbb-cccc-555555555555"
    _make_single_draft(_tmp_drafts_dir, draft_id, general_type.id)
    lock_path = _tmp_drafts_dir / f"{draft_id}.commit.lock"
    lock_path.write_bytes(b"1")

    monkeypatch.setattr(draft_adapter_module, "_CONCURRENT_COMMIT_RETRIES", 1)
    monkeypatch.setattr(draft_adapter_module, "_CONCURRENT_COMMIT_RETRY_DELAY", 0)

    result = await commit_order_draft(draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin"))

    order = await order_service.find_by_source_draft_id(db_session, draft_id)
    assert order is not None
    assert result["id"] == order.id
    assert not lock_path.exists(), "stale commit lock must be removed"


async def test_integrity_error_returns_existing_order(
    db_session, _tmp_drafts_dir, _enable_onlyoffice, create_order, monkeypatch
):
    """Дубликат UNIQUE(source_draft_id) → rollback + durable lookup → возвращается
    существующий Order; файл существующего приказа НЕ удалён."""
    await order_service.ensure_default_order_types(db_session)
    general_type = await order_service.get_order_type_by_code(db_session, "general_order")
    draft_id = "66666666-aaaa-bbbb-cccc-666666666666"

    # «Конкурентный» commit уже создал Order с этим source_draft_id.
    existing = await create_order(source_draft_id=draft_id)
    existing_id = existing.id
    # Pre-insert становится durable внутри внешней транзакции: rollback внутреннего
    # savepoint'а (в IntegrityError-ветке адаптера) его не откатит.
    await db_session.commit()

    _make_single_draft(_tmp_drafts_dir, draft_id, general_type.id)

    # Первый durable-lookup имитирует гонку (заказ ещё не виден) → commit уходит в create.
    real_find = order_service.find_by_source_draft_id
    calls: list[str] = []

    async def race_find(db, source_draft_id):
        calls.append(source_draft_id)
        if len(calls) == 1:
            return None
        return await real_find(db, source_draft_id)

    monkeypatch.setattr(order_service, "find_by_source_draft_id", race_find)

    result = await commit_order_draft(draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin"))

    assert result["id"] == existing_id
    assert len(calls) >= 2, "durable lookup должен повториться после rollback"
    lock_path = _tmp_drafts_dir / f"{draft_id}.commit.lock"
    assert not lock_path.exists()
    # Файл существующего приказа не удалён: _do_create_order не unlink'ает на IntegrityError.
    year_dir = Path(settings.ORDERS_PATH) / "2026"
    assert any(year_dir.glob("*.docx")), "permanent file must survive IntegrityError"


async def test_do_create_order_integrity_error_keeps_permanent_file(monkeypatch, tmp_path):
    """#94: на IntegrityError `_do_create_order` НЕ удаляет permanent-файл (иначе
    дубликат уничтожил бы файл уже существующего приказа)."""
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))
    order_draft_service._drafts_dir = tmp_path / ".drafts"
    order_draft_service.ensure_drafts_dir()

    draft_id = "88888888-aaaa-bbbb-cccc-888888888888"
    draft_path = order_draft_service._drafts_dir / f"{draft_id}_order.docx"
    draft_path.write_bytes(b"draft-content")

    permanent_written: list[Path] = []

    async def fake_generate(order_number, data, employee, order_type, year_dir_arg):
        year_dir_arg.mkdir(parents=True, exist_ok=True)
        dest = year_dir_arg / f"{order_type.code}_{order_number}.docx"
        dest.write_bytes(b"copied-from-draft")
        permanent_written.append(dest)
        return f"{data.order_date.year}/{dest.name}", dest.name

    async def failing_finish(*_args, **_kwargs):
        # Дубликат UNIQUE(source_draft_id) как от psycopg2: orig.diag.constraint_name.
        raise _integrity_error_with_constraint("ix_orders_source_draft_id_unique")

    svc = OrderService()
    order_type = SimpleNamespace(id=1, code="general_order", name="Общий", is_active=True)

    async def fake_ensure(db):
        return [order_type]

    async def fake_get_type(db, type_id):
        return order_type

    monkeypatch.setattr(order_service_module, "generate_document", fake_generate)
    monkeypatch.setattr(svc, "ensure_default_order_types", fake_ensure)
    monkeypatch.setattr(svc.order_type_repo, "get_by_id", fake_get_type)
    monkeypatch.setattr(svc, "_finish_create_order", failing_finish)

    db = MagicMock()
    db.in_transaction.return_value = True

    with pytest.raises(IntegrityError):
        await svc.create_order(
            db,
            OrderCreate(
                employee_id=None,
                order_type_id=1,
                order_date=date(2026, 8, 1),
                order_number="DRAFT-INT-1",
                draft_id=draft_id,
            ),
        )

    assert permanent_written, "permanent file должен был скопироваться до фейла"
    for p in permanent_written:
        assert p.exists(), f"permanent file must NOT be unlinked on IntegrityError: {p}"


@pytest.mark.parametrize(
    "exc, expected_exists",
    [
        pytest.param(
            _integrity_error_with_constraint("ix_orders_source_draft_id_unique"),
            True,
            id="duplicate-source-draft-keeps-file",
        ),
        pytest.param(
            _integrity_error_with_constraint("uq_order_employees_order_employee"),
            False,
            id="other-constraint-unlinks-orphan",
        ),
        pytest.param(
            _integrity_error_without_diag("duplicate key value violates unique constraint"),
            False,
            id="no-orig-diag-fallback-foreign-name-unlinks",
        ),
    ],
)
async def test_do_create_order_integrity_error_orphan_cleanup(
    monkeypatch, tmp_path, exc, expected_exists
):
    """#105: не-дубликат IntegrityError удаляет орфан permanent-файла; дубликат
    source_draft_id — сохраняет (идемпотентность, #94/ADR-0009)."""
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path))
    order_draft_service._drafts_dir = tmp_path / ".drafts"
    order_draft_service.ensure_drafts_dir()

    draft_id = "10500000-aaaa-bbbb-cccc-105000000000"
    draft_path = order_draft_service._drafts_dir / f"{draft_id}_order.docx"
    draft_path.write_bytes(b"draft-content")

    permanent_written: list[Path] = []

    async def fake_generate(order_number, data, employee, order_type, year_dir_arg):
        year_dir_arg.mkdir(parents=True, exist_ok=True)
        dest = year_dir_arg / f"{order_type.code}_{order_number}.docx"
        dest.write_bytes(b"copied-from-draft")
        permanent_written.append(dest)
        return f"{data.order_date.year}/{dest.name}", dest.name

    async def failing_finish(*_args, **_kwargs):
        raise exc

    svc = OrderService()
    order_type = SimpleNamespace(id=1, code="general_order", name="Общий", is_active=True)

    async def fake_ensure(db):
        return [order_type]

    async def fake_get_type(db, type_id):
        return order_type

    monkeypatch.setattr(order_service_module, "generate_document", fake_generate)
    monkeypatch.setattr(svc, "ensure_default_order_types", fake_ensure)
    monkeypatch.setattr(svc.order_type_repo, "get_by_id", fake_get_type)
    monkeypatch.setattr(svc, "_finish_create_order", failing_finish)

    db = MagicMock()
    db.in_transaction.return_value = True

    with pytest.raises(IntegrityError):
        await svc.create_order(
            db,
            OrderCreate(
                employee_id=None,
                order_type_id=1,
                order_date=date(2026, 8, 1),
                order_number="DRAFT-INT-2",
                draft_id=draft_id,
            ),
        )

    assert permanent_written, "permanent file должен был скопироваться до фейла"
    for p in permanent_written:
        if expected_exists:
            assert p.exists(), f"duplicate IntegrityError должен сохранить файл: {p}"
        else:
            assert not p.exists(), f"не-дубликат IntegrityError должен удалить орфан: {p}"


# === #95: group ===


async def test_group_repeated_commit_returns_same_order(
    db_session, _tmp_drafts_dir, _enable_onlyoffice, create_employee
):
    """Два последовательных commit одного group-draft → 200 с одним и тем же order_id."""
    await order_service.ensure_default_order_types(db_session)
    emp1 = await create_employee()
    emp2 = await create_employee()
    draft_id = "33333333-aaaa-bbbb-cccc-333333333333"
    _make_group_draft(_tmp_drafts_dir, draft_id, [emp1.id, emp2.id])

    first = await commit_group_order_draft(draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin"))
    second = await commit_group_order_draft(draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin"))

    assert first["is_group"] is True
    assert second["id"] == first["id"]
    assert "duplicate" not in second


async def test_source_draft_id_written_group(
    db_session, _tmp_drafts_dir, _enable_onlyoffice, create_employee
):
    """После group-commit `Order.source_draft_id == draft_id` (parity со single)."""
    await order_service.ensure_default_order_types(db_session)
    emp1 = await create_employee()
    emp2 = await create_employee()
    draft_id = "99999999-aaaa-bbbb-cccc-999999999999"
    _make_group_draft(_tmp_drafts_dir, draft_id, [emp1.id, emp2.id])

    result = await commit_group_order_draft(draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin"))

    order = await order_service.find_by_source_draft_id(db_session, draft_id)
    assert order is not None
    assert order.source_draft_id == draft_id
    assert order.is_group is True
    assert order.id == result["id"]


async def test_group_commit_rollback_on_order_employee_failure(
    db_session, _tmp_drafts_dir, _enable_onlyoffice, create_employee, monkeypatch
):
    """#95: падение вставки OrderEmployee → all-or-nothing.

    В БД нет строки orders для draft, lock снят, черновик не consumed (replay возможен).
    """
    await order_service.ensure_default_order_types(db_session)
    emp1 = await create_employee()
    emp2 = await create_employee()
    draft_id = "77777777-aaaa-bbbb-cccc-777777777777"
    _make_group_draft(_tmp_drafts_dir, draft_id, [emp1.id, emp2.id])

    def boom_insert(*_args, **_kwargs):
        raise IntegrityError("INSERT OrderEmployee", {}, Exception("FK violation"))

    monkeypatch.setattr(order_service_module, "sa_insert", boom_insert)

    with pytest.raises(IntegrityError):
        await commit_group_order_draft(draft_id=draft_id, db=db_session, current_user=CurrentUser("admin", role="admin"))

    # All-or-nothing: rollback убрал и orders-строку, и OrderEmployee/Vacation.
    assert await order_service.find_by_source_draft_id(db_session, draft_id) is None
    lock_path = _tmp_drafts_dir / f"{draft_id}.commit.lock"
    assert not lock_path.exists(), "commit lock must be released for replay"
    assert (_tmp_drafts_dir / f"{draft_id}_vacation_unpaid_group.docx").exists(), "draft not consumed"
    assert order_draft_service.get_metadata_path(draft_id).exists(), "metadata not consumed"
