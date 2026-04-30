import zipfile

import pytest
from fastapi import HTTPException

from app.api import backups
from app.core.config import settings


def test_write_storage_dirs_to_zip(monkeypatch, tmp_path):
    orders_root = tmp_path / "orders"
    staffing_root = tmp_path / "staffing"
    templates_root = tmp_path / "templates"
    personal_root = tmp_path / "personal"
    (orders_root / "2026").mkdir(parents=True)
    staffing_root.mkdir()
    templates_root.mkdir()
    personal_root.mkdir()
    (orders_root / "2026" / "order.docx").write_bytes(b"order")
    (staffing_root / "staff.xlsx").write_bytes(b"staff")

    monkeypatch.setattr(settings, "ORDERS_PATH", str(orders_root))
    monkeypatch.setattr(settings, "STAFFING_PATH", str(staffing_root))
    monkeypatch.setattr(settings, "TEMPLATES_PATH", str(templates_root))
    monkeypatch.setattr(settings, "PERSONAL_FILES_PATH", str(personal_root))

    archive_path = tmp_path / "backup.zip"
    with zipfile.ZipFile(archive_path, "w") as zip_file:
        backups._write_storage_dirs_to_zip(zip_file)

    with zipfile.ZipFile(archive_path) as zip_file:
        assert zip_file.read("data/orders/2026/order.docx") == b"order"
        assert zip_file.read("data/staffing/staff.xlsx") == b"staff"


def test_extract_storage_dirs_rejects_traversal(tmp_path):
    archive_path = tmp_path / "backup.zip"
    with zipfile.ZipFile(archive_path, "w") as zip_file:
        zip_file.writestr("data/orders/../secret.txt", b"bad")

    with pytest.raises(HTTPException):
        backups._extract_storage_dirs_from_archive(archive_path, tmp_path / "out")


def test_replace_storage_dirs_removes_stale_files(monkeypatch, tmp_path):
    orders_root = tmp_path / "orders"
    staffing_root = tmp_path / "staffing"
    templates_root = tmp_path / "templates"
    personal_root = tmp_path / "personal"
    for root in [orders_root, staffing_root, templates_root, personal_root]:
        root.mkdir()
        (root / "stale.txt").write_text("stale")

    extracted_root = tmp_path / "extracted"
    (extracted_root / "orders" / "2026").mkdir(parents=True)
    (extracted_root / "orders" / "2026" / "order.docx").write_bytes(b"order")

    monkeypatch.setattr(settings, "ORDERS_PATH", str(orders_root))
    monkeypatch.setattr(settings, "STAFFING_PATH", str(staffing_root))
    monkeypatch.setattr(settings, "TEMPLATES_PATH", str(templates_root))
    monkeypatch.setattr(settings, "PERSONAL_FILES_PATH", str(personal_root))

    backups._replace_storage_dirs(extracted_root)

    assert (orders_root / "2026" / "order.docx").read_bytes() == b"order"
    assert not (orders_root / "stale.txt").exists()
    assert not (staffing_root / "stale.txt").exists()


def test_csv_export_filename_sanitizes_table_name():
    assert backups._csv_export_filename("orders") == "orders.csv"
    assert backups._csv_export_filename("weird/table name") == "weird_table_name.csv"


def test_write_table_exports_to_zip(monkeypatch, tmp_path):
    monkeypatch.setattr(backups, "_get_all_tables", lambda _db_name=None: ["orders", "employees"])
    monkeypatch.setattr(backups, "_export_table_csv", lambda table_name, _db_name=None: f"id,name\n1,{table_name}\n")

    archive_path = tmp_path / "backup.zip"
    with zipfile.ZipFile(archive_path, "w") as zip_file:
        exports = backups._write_table_exports_to_zip(zip_file, "hrms_dev")

    assert exports == [
        {"table": "orders", "path": "exports/tables/orders.csv", "format": "csv"},
        {"table": "employees", "path": "exports/tables/employees.csv", "format": "csv"},
    ]
    with zipfile.ZipFile(archive_path) as zip_file:
        assert zip_file.read("exports/tables/orders.csv").decode("utf-8-sig") == "id,name\n1,orders\n"
        assert zip_file.getinfo("hrms_tables.xlsx").file_size > 0
        readme = zip_file.read("exports/README.txt").decode("utf-8")
        assert "табличный экспорт" in readme
        assert "hrms_tables.xlsx" in readme
