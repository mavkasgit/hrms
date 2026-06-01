"""Unified template placeholder builder for all document types.

Provides a single source of truth for placeholder generation across
orders, notifications, and statements.
"""
from datetime import date, datetime
from typing import Any


def build_template_replacements_for_employee(employee: Any) -> dict[str, str]:
    """Build all employee-related placeholder replacements.

    Works for Employee ORM objects or any object with these attributes:
    name, position.name, department.name, tab_number, hire_date, contract_start, gender
    """
    if not employee or not getattr(employee, "name", ""):
        return {
            "{full_name}": "",
            "{short_name}": "",
            "{last_name}": "",
            "{first_name}": "",
            "{middle_name}": "",
            "{position}": "",
            "{position_cap}": "",
            "{department}": "",
            "{tab_number}": "",
            "{hire_date}": "",
            "{contract_start}": "",
            "{oznak}": "",
            "{oznak_gender}": "",
            "{agreement}": "",
            "{initials_before}": "",
            "{full_name_upper}": "",
            "{full_name_title}": "",
            "{full_name_last_caps}": "",
            "{last_name_upper}": "",
            "{last_name_then_initials}": "",
            "{initials}": "",
        }

    name = employee.name
    name_parts = name.split()
    last_name = name_parts[0] if name_parts else ""
    first_name = name_parts[1] if len(name_parts) > 1 else ""
    middle_name = name_parts[2] if len(name_parts) > 2 else ""
    initials_nospace = "".join(f"{p[0]}." for p in name_parts[1:]) if len(name_parts) > 1 else ""
    initials_underscore = "_".join(p[0] for p in name_parts[1:]) if len(name_parts) > 1 else ""

    position_name = str(getattr(getattr(employee, "position", None), "name", "") or "")
    department = str(getattr(getattr(employee, "department", None), "name", "") or "")
    tab_number = str(getattr(employee, "tab_number", "") or "")
    hire_date = ""
    hd = getattr(employee, "hire_date", None)
    if hd:
        hire_date = hd.strftime("%d.%m.%Y") if hasattr(hd, "strftime") else str(hd)
    contract_start = ""
    cs = getattr(employee, "contract_start", None)
    if cs:
        contract_start = cs.strftime("%d.%m.%Y") if hasattr(cs, "strftime") else str(cs)
    gender = getattr(employee, "gender", "male")
    oznak = "ознакомлена" if gender == "female" else "ознакомлен"
    agreement = "согласна" if gender == "female" else "согласен"

    return {
        "{full_name}": name,
        "{short_name}": f"{last_name} {initials_nospace}".strip(),
        "{last_name}": last_name,
        "{first_name}": first_name,
        "{middle_name}": middle_name,
        "{position}": position_name.lower(),
        "{position_cap}": position_name.capitalize(),
        "{department}": department,
        "{tab_number}": tab_number,
        "{hire_date}": hire_date,
        "{contract_start}": contract_start,
        "{oznak}": oznak,
        "{oznak_gender}": oznak,
        "{agreement}": agreement,
        "{initials_before}": f"{initials_nospace}{last_name}".strip(),
        "{full_name_upper}": name.upper(),
        "{full_name_title}": name.title(),
        "{full_name_last_caps}": f"{last_name.upper()} {first_name} {middle_name}".strip(),
        "{last_name_upper}": last_name.upper(),
        "{last_name_then_initials}": f"{last_name} {initials_nospace}".strip(),
        "{initials}": initials_underscore,
    }


def _parse_date_like(value: Any) -> date | None:
    """Parse a date from date/datetime objects or common string formats."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
            try:
                return datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
    return None


def _format_date_ddmmyyyy(value: Any) -> str:
    """Format date-like values as DD.MM.YYYY, fallback to string."""
    parsed = _parse_date_like(value)
    if parsed is not None:
        return parsed.strftime("%d.%m.%Y")
    return str(value) if value is not None else ""


def build_doc_base_replacements(
    title: str = "",
    number: str = "",
    doc_date: Any = None,
) -> dict[str, str]:
    """Build base document placeholders common to all doc types."""
    date_str = _format_date_ddmmyyyy(doc_date) if doc_date else ""
    return {
        "{doc_title}": title,
        "{doc_number}": number,
        "{doc_date}": date_str,
        # Aliases: order_* works in all doc types
        "{order_number}": number,
        "{order_date}": date_str,
    }


def build_extra_field_replacements(extra_fields: dict | None) -> dict[str, str]:
    """Build replacements from extra_fields dict.

    Skips empty values so auto-filled placeholders are preserved.
    """
    replacements = {}
    for key, value in (extra_fields or {}).items():
        # Skip empty values - they should not override auto-filled placeholders
        if value == "" or value is None:
            continue
        replacements[f"{{{key}}}"] = _format_date_ddmmyyyy(value)
    return replacements


def build_document_replacements(
    doc_type: str,  # "order", "notification", "statement"
    doc_number: str,
    doc_date: Any,
    doc_type_name: str = "",
    doc_type_code: str = "",
    employee: Any = None,
    extra_fields: dict | None = None,
    notes: str = "",
) -> dict[str, str]:
    """Universal replacements builder for all document types.

    Args:
        doc_type: One of "order", "notification", "statement"
        doc_number: Document number
        doc_date: Document date
        doc_type_name: Human-readable type name (e.g. "Прием на работу")
        doc_type_code: Type code (e.g. "hire", "contract_extension")
        employee: Employee object
        extra_fields: Additional fields from form
        notes: Order notes/comments
    """
    # Base document info
    replacements = build_doc_base_replacements(
        title=doc_type_name,
        number=doc_number,
        doc_date=doc_date,
    )

    # Document type specific placeholders
    if doc_type == "order":
        order_date_str = _format_date_ddmmyyyy(doc_date) if doc_date else ""
        replacements.update({
            "{order_number}": doc_number,
            "{order_date}": order_date_str,
            "{order_type_name}": doc_type_name,
            "{order_type_code}": doc_type_code,
            "{order_type_lower}": doc_type_name.lower(),
            "{notes}": notes,
            # Aliases: doc_* = order_* for cross-compatibility
            "{doc_number}": doc_number,
            "{doc_date}": order_date_str,
        })
    elif doc_type == "notification":
        notif_date_str = _format_date_ddmmyyyy(doc_date) if doc_date else ""
        replacements.update({
            "{notification_type_name}": doc_type_name,
            "{notification_type_code}": doc_type_code,
            # Aliases: doc_* = notification_*
            "{doc_number}": doc_number,
            "{doc_date}": notif_date_str,
        })
    elif doc_type == "statement":
        stmt_date_str = _format_date_ddmmyyyy(doc_date) if doc_date else ""
        replacements.update({
            "{statement_type_name}": doc_type_name,
            "{statement_type_code}": doc_type_code,
            # Aliases: doc_* = statement_*
            "{doc_number}": doc_number,
            "{doc_date}": stmt_date_str,
        })

    # Employee data
    replacements.update(build_template_replacements_for_employee(employee))

    # Extra fields (dates, text, etc.)
    extra_raw = extra_fields or {}
    replacements.update(build_extra_field_replacements(extra_raw))

    # ─── Auto-fill logic for specific document types ─────────────────────────

    # Contract extension: auto-fill old contract dates from employee
    if doc_type_code in ("contract_extension",) and employee:
        if not extra_raw.get("old_contract_start"):
            cs = getattr(employee, "contract_start", None)
            if cs:
                replacements["{old_contract_start}"] = _format_date_ddmmyyyy(cs)
        if not extra_raw.get("old_contract_end"):
            ce = getattr(employee, "contract_end", None)
            if ce:
                replacements["{old_contract_end}"] = _format_date_ddmmyyyy(ce)

    # Statement contract_expiry: auto-fill contract start
    if doc_type_code == "contract_expiry" and employee:
        cs = getattr(employee, "contract_start", None)
        if cs:
            replacements["{old_contract_start}"] = _format_date_ddmmyyyy(cs)

    # Calculate contract duration in years
    if doc_type_code in ("contract_extension", "new_contract") and extra_raw:
        new_start = _parse_date_like(extra_raw.get("new_contract_start"))
        new_end = _parse_date_like(extra_raw.get("new_contract_end"))
        if new_start and new_end:
            years = new_end.year - new_start.year
            if (new_end.month, new_end.day) < (new_start.month, new_start.day):
                years -= 1
            if years > 0:
                replacements["{new_contract_years}"] = str(years)
                replacements["{contract_end_years}"] = str(years)

    # Order-specific: hire dates logic
    if doc_type == "order" and doc_type_code == "hire":
        # For hire orders WITHOUT extra_fields, keep hire_date/contract_start blank
        # (legacy behavior: user must enter dates manually in the form)
        if not extra_raw:
            replacements["{hire_date}"] = ""
            replacements["{contract_start}"] = ""
        # else: extra_fields already updated these via build_extra_field_replacements

        # Backward-compatible alias
        replacements["{hire_order_date}"] = replacements.get("{hire_date}", "")

        # Calculate trial period months
        hd = _parse_date_like(extra_raw.get("hire_date")) if extra_raw else None
        td = _parse_date_like(extra_raw.get("trial_end")) if extra_raw else None
        if hd and td:
            months = (td.year - hd.year) * 12 + (td.month - hd.month)
            if months > 0:
                replacements["{trial_end_months}"] = str(months)

        # Calculate contract duration in years
        cd = _parse_date_like(extra_raw.get("contract_end")) if extra_raw else None
        if hd and cd:
            years = cd.year - hd.year
            if (cd.month, cd.day) < (hd.month, hd.day):
                years -= 1
            if years > 0:
                replacements["{contract_end_years}"] = str(years)
    else:
        # For non-hire orders, always add hire_order_date alias from employee hire_date
        replacements["{hire_order_date}"] = replacements.get("{hire_date}", "")

    # Ensure calculated fields have fallbacks
    replacements.setdefault("{trial_end_months}", "")
    replacements.setdefault("{contract_end_years}", "")
    replacements.setdefault("{new_contract_years}", "")

    return replacements


# ─── Backward-compatible wrappers ──────────────────────────────────────────────


def build_order_replacements(
    order_number: str,
    order_date: Any,
    order_type_name: str = "",
    order_type_code: str = "",
    employee: Any = None,
    extra_fields: dict | None = None,
    notes: str = "",
) -> dict[str, str]:
    """Backward-compatible wrapper for build_document_replacements."""
    return build_document_replacements(
        doc_type="order",
        doc_number=order_number,
        doc_date=order_date,
        doc_type_name=order_type_name,
        doc_type_code=order_type_code,
        employee=employee,
        extra_fields=extra_fields,
        notes=notes,
    )


def build_notification_replacements(
    title: str,
    number: str,
    doc_date: Any,
    employee: Any = None,
    notification_type_name: str = "",
    notification_type_code: str = "",
    extra_fields: dict | None = None,
) -> dict[str, str]:
    """Backward-compatible wrapper for build_document_replacements."""
    return build_document_replacements(
        doc_type="notification",
        doc_number=number,
        doc_date=doc_date,
        doc_type_name=notification_type_name,
        doc_type_code=notification_type_code,
        employee=employee,
        extra_fields=extra_fields,
    )


def build_statement_replacements(
    title: str,
    number: str,
    doc_date: Any,
    employee: Any = None,
    statement_type_name: str = "",
    statement_type_code: str = "",
    extra_fields: dict | None = None,
) -> dict[str, str]:
    """Backward-compatible wrapper for build_document_replacements."""
    return build_document_replacements(
        doc_type="statement",
        doc_number=number,
        doc_date=doc_date,
        doc_type_name=statement_type_name,
        doc_type_code=statement_type_code,
        employee=employee,
        extra_fields=extra_fields,
    )


# ─── Group order helpers ────────────────────────────────────────────────────────

def build_group_order_general_replacements(
    employee_rows: list[dict],
    order_number: str,
    order_date: Any,
    extra: dict[str, str] | None = None,
) -> dict[str, str]:
    """Build general (non-per-employee) replacements for group orders."""
    first_emp = employee_rows[0]["employee"] if employee_rows else None
    emp_replacements = build_template_replacements_for_employee(first_emp)

    replacements = {
        "{order_number}": order_number,
        "{order_date}": _format_date_ddmmyyyy(order_date) if order_date else "",
        **emp_replacements,
    }
    if extra:
        replacements.update(extra)
    return replacements


def build_group_order_employee_replacements(
    idx: int,
    emp: Any,
    extra: dict[str, str] | None = None,
) -> dict[str, str]:
    """Build per-employee placeholder replacements for group orders."""
    replacements = {
        "{index}": str(idx),
        **build_template_replacements_for_employee(emp),
    }
    # Ensure position is lowercase for group orders
    position_name = str(getattr(getattr(emp, "position", None), "name", "") or "")
    replacements["{position}"] = position_name.lower()

    if extra:
        replacements.update(extra)
    return replacements


def build_vacation_group_extra(
    vacation_start: Any,
    vacation_end: Any,
    vacation_days: int | str = "",
    application_date: Any = None,
) -> dict[str, str]:
    """Build extra replacements for vacation group orders."""
    return {
        "{vacation_days}": str(vacation_days),
        "{vacation_start}": _format_date_ddmmyyyy(vacation_start),
        "{vacation_end}": _format_date_ddmmyyyy(vacation_end),
        "{application_date}": _format_date_ddmmyyyy(application_date) if application_date else "",
    }


def build_call_group_extra(
    call_start: Any,
    call_end: Any,
    vacation_days: int | str = "",
    application_date: Any = None,
) -> dict[str, str]:
    """Build extra replacements for weekend call group orders."""
    # Format call_date: single date if start==end, otherwise range
    if call_start == call_end:
        call_date_display = _format_date_ddmmyyyy(call_start)
    else:
        call_date_display = f"{_format_date_ddmmyyyy(call_start)} по {_format_date_ddmmyyyy(call_end)}"

    return {
        "{vacation_days}": str(vacation_days),
        "{call_date}": call_date_display,
        "{call_date_start}": _format_date_ddmmyyyy(call_start),
        "{call_date_end}": _format_date_ddmmyyyy(call_end),
        "{application_date}": _format_date_ddmmyyyy(application_date) if application_date else "",
    }


# ─── Block markers for repeat blocks ───────────────────────────────────────────

EMPLOYEES_BLOCK_START = "{employees_block_start}"
EMPLOYEES_BLOCK_END = "{employees_block_end}"
APPLICATIONS_BLOCK_START = "{applications_block_start}"
APPLICATIONS_BLOCK_END = "{applications_block_end}"
