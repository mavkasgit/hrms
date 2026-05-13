from pathlib import Path

from app.api.documents import _resolve_file_path
from app.core.config import settings


def test_documents_resolve_vacation_calendar_legacy_filename(monkeypatch):
    monkeypatch.setattr(settings, "STAFFING_PATH", "/app/data/staffing")

    path = _resolve_file_path("2026.xlsx", "vacation_calendar")

    assert path.as_posix() == "/app/data/staffing/vacation_calendar/2026.xlsx"


def test_documents_resolve_vacation_calendar_prefixed_key(monkeypatch):
    monkeypatch.setattr(settings, "STAFFING_PATH", "/app/data/staffing")

    path = _resolve_file_path("vacation_calendar/2026.xlsx", "vacation_calendar")

    assert path.as_posix() == "/app/data/staffing/vacation_calendar/2026.xlsx"
