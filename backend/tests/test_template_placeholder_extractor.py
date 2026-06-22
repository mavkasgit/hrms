"""Tests for template placeholder extractor."""
from pathlib import Path
from unittest.mock import Mock, patch

from app.services.template_placeholder_extractor import (
    extract_placeholders_from_docx,
    suggest_field_schema,
)


def test_suggest_field_schema_includes_all_placeholders():
    """All placeholders should appear in schema so user can see/edit them."""
    placeholders = [
        "full_name", "hire_date", "order_number",  # auto-filled
        "vacation_start", "vacation_end", "vacation_days",  # user-filled
    ]

    schema = suggest_field_schema(placeholders)
    schema_keys = [f["key"] for f in schema]

    # ALL should appear
    assert "full_name" in schema_keys
    assert "hire_date" in schema_keys
    assert "order_number" in schema_keys
    assert "vacation_start" in schema_keys
    assert "vacation_end" in schema_keys
    assert "vacation_days" in schema_keys


def test_suggest_field_schema_infers_types():
    """Field types should be inferred from key names."""
    placeholders = ["vacation_start", "vacation_days", "comment", "some_field"]

    schema = suggest_field_schema(placeholders)
    schema_by_key = {f["key"]: f for f in schema}

    assert schema_by_key["vacation_start"]["type"] == "date"
    assert schema_by_key["vacation_days"]["type"] == "number"
    assert schema_by_key["comment"]["type"] == "textarea"
    assert schema_by_key["some_field"]["type"] == "text"


def test_suggest_field_schema_generates_labels():
    """Labels should be human-readable from snake_case keys."""
    placeholders = ["custom_start_date", "some_other_field"]

    schema = suggest_field_schema(placeholders)
    schema_by_key = {f["key"]: f for f in schema}

    assert schema_by_key["custom_start_date"]["label"] == "Custom start date"
    assert schema_by_key["some_other_field"]["label"] == "Some other field"


def test_extract_placeholders_from_nonexistent_file():
    """Should return empty list for non-existent files."""
    result = extract_placeholders_from_docx(Path("/nonexistent/file.docx"))
    assert result == []
