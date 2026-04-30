from pathlib import Path

import pytest

from app.core.config import settings
from app.core.paths import storage_key, storage_path


def test_storage_key_is_relative_to_current_base(monkeypatch, tmp_path):
    orders_root = tmp_path / "orders"
    monkeypatch.setattr(settings, "ORDERS_PATH", str(orders_root))

    key = storage_key(orders_root / "2026" / "order.docx", "ORDERS_PATH")

    assert key == "2026/order.docx"


def test_storage_key_converts_legacy_windows_order_path(monkeypatch):
    monkeypatch.setattr(settings, "ORDERS_PATH", "/app/data/orders")

    key = storage_key(
        r"C:\Users\user\VibeCoding\hrms\backend\data\orders\2026\order.docx",
        "ORDERS_PATH",
    )

    assert key == "2026/order.docx"


def test_storage_path_converts_legacy_windows_staffing_path(monkeypatch):
    monkeypatch.setattr(settings, "STAFFING_PATH", "/app/data/staffing")

    path = storage_path(
        r"C:\Users\user\VibeCoding\hrms\backend\data\staffing\staff.xlsx",
        "STAFFING_PATH",
    )

    assert path.as_posix().endswith("/app/data/staffing/staff.xlsx")


def test_storage_path_rejects_traversal(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path / "orders"))

    with pytest.raises(ValueError):
        storage_path("../secret.docx", "ORDERS_PATH")


def test_storage_path_rejects_unknown_absolute_path(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ORDERS_PATH", str(tmp_path / "orders"))

    with pytest.raises(ValueError):
        storage_path(Path(tmp_path).parent / "outside" / "order.docx", "ORDERS_PATH")
