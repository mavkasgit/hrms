from pathlib import Path

from app.api.documents import _resolve_file_path
from app.api.vacation_plans import _make_vacation_calendar_relative, _resolve_vacation_calendar_path
from app.core.config import settings


def test_documents_resolve_vacation_calendar_legacy_filename(monkeypatch):
    monkeypatch.setattr(settings, "STAFFING_PATH", "/app/data/staffing")

    path = _resolve_file_path("2026.xlsx", "vacation_calendar")

    assert path.as_posix() == "/app/data/staffing/vacation_calendar/2026.xlsx"


def test_documents_resolve_vacation_calendar_prefixed_key(monkeypatch):
    monkeypatch.setattr(settings, "STAFFING_PATH", "/app/data/staffing")

    path = _resolve_file_path("vacation_calendar/2026.xlsx", "vacation_calendar")

    assert path.as_posix() == "/app/data/staffing/vacation_calendar/2026.xlsx"


def test_vacation_plan_resolve_vacation_calendar_legacy_absolute_path(monkeypatch):
    monkeypatch.setattr(settings, "STAFFING_PATH", "/app/data/staffing")

    path = _resolve_vacation_calendar_path(
        r"C:\Users\user\VibeCoding\hrms\backend\data\staffing\vacation_calendar\2026.xlsx"
    )

    assert path.as_posix().endswith("/app/data/staffing/vacation_calendar/2026.xlsx")


def test_vacation_plan_make_relative_keeps_vacation_calendar_prefix(monkeypatch):
    monkeypatch.setattr(settings, "STAFFING_PATH", "/app/data/staffing")

    key = _make_vacation_calendar_relative(Path("/app/data/staffing/vacation_calendar/2026.xlsx"))

    assert key == "vacation_calendar/2026.xlsx"
