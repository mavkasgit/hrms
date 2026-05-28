"""Extract placeholders from DOCX templates and suggest field schemas."""
import re
from pathlib import Path
from typing import Any

from docx import Document

# Плейсхолдеры которые НЕ нужно показывать в форме — они заполняются автоматически
AUTO_FILLED_PLACEHOLDERS = frozenset({
    # Employee data
    "full_name", "short_name", "last_name", "first_name", "middle_name",
    "full_name_upper", "full_name_title", "full_name_last_caps",
    "last_name_upper", "initials_before", "last_name_then_initials", "initials",
    "position", "position_cap", "department", "tab_number",
    "hire_date", "contract_start", "oznak", "oznak_gender",
    # Document base
    "doc_number", "doc_date", "doc_title",
    # Order specific
    "order_number", "order_date", "order_type_name", "order_type_code", "order_type_lower",
    "hire_order_date",
    # Notification specific
    "notification_type_name", "notification_type_code",
    # Statement specific
    "statement_type_name", "statement_type_code",
    # Calculated
    "trial_end_months", "contract_end_years", "new_contract_years",
    # Contract extension (auto-filled from employee)
    "old_contract_start", "old_contract_end",
    # Block markers
    "employees_block_start", "employees_block_end",
    "applications_block_start", "applications_block_end",
    # Other
    "index", "notes",
})

# Паттерн для поиска плейсхолдеров
PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


def extract_placeholders_from_docx(file_path: Path) -> list[str]:
    """Extract all unique placeholder names from a DOCX file."""
    if not file_path.exists():
        return []

    doc = Document(str(file_path))
    placeholders: set[str] = set()

    # Extract from paragraphs
    for paragraph in doc.paragraphs:
        placeholders.update(PLACEHOLDER_RE.findall(paragraph.text))

    # Extract from tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                placeholders.update(PLACEHOLDER_RE.findall(cell.text))

    return sorted(placeholders)


def _key_to_label(key: str) -> str:
    """Convert snake_case key to human-readable label."""
    # Replace underscores with spaces and capitalize
    words = key.replace("_", " ").split()
    return " ".join(words).capitalize()


def _suggest_field_type(key: str) -> str:
    """Suggest field type based on key name."""
    key_lower = key.lower()

    # Date fields
    if any(word in key_lower for word in ("date", "start", "end", "recall", "trial")):
        return "date"

    # Number fields
    if any(word in key_lower for word in ("days", "months", "years", "count", "number")):
        return "number"

    # Textarea for long content
    if any(word in key_lower for word in ("comment", "note", "reason", "description")):
        return "textarea"

    return "text"


def suggest_field_schema(placeholders: list[str]) -> list[dict[str, Any]]:
    """Build field schema suggestions from extracted placeholders.

    ALL placeholders from template are included so user can see and edit them.
    """
    schema = []
    for placeholder in placeholders:
        schema.append({
            "key": placeholder,
            "label": _key_to_label(placeholder),
            "type": _suggest_field_type(placeholder),
            "required": False,
        })

    return schema
