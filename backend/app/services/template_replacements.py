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
    return {
        "{doc_title}": title,
        "{doc_number}": number,
        "{doc_date}": _format_date_ddmmyyyy(doc_date) if doc_date else "",
    }


def build_extra_field_replacements(extra_fields: dict | None) -> dict[str, str]:
    """Build replacements from extra_fields dict."""
    replacements = {}
    for key, value in (extra_fields or {}).items():
        replacements[f"{{{key}}}"] = _format_date_ddmmyyyy(value)
    return replacements


def build_order_replacements(
    order_number: str,
    order_date: Any,
    order_type_name: str = "",
    order_type_code: str = "",
    employee: Any = None,
    extra_fields: dict | None = None,
    notes: str = "",
) -> dict[str, str]:
    """Build complete replacements for order documents."""
    order_date_str = _format_date_ddmmyyyy(order_date) if order_date else ""
    replacements = {
        **build_doc_base_replacements(
            title=order_type_name,
            number=order_number,
            doc_date=order_date,
        ),
        "{order_number}": order_number,
        "{order_date}": order_date_str,
        "{order_type_name}": order_type_name,
        "{order_type_code}": order_type_code,
        "{order_type_lower}": order_type_name.lower(),
        "{notes}": notes,
    }

    replacements.update(build_template_replacements_for_employee(employee))
    replacements["{oznak_gender}"] = replacements.get("{oznak}", "")

    # For hire orders, prefer extra_fields dates
    use_extra_hire_dates = order_type_code == "hire"
    extra_raw = extra_fields or {}
    extra = build_extra_field_replacements(extra_raw)
    replacements.update(extra)

    if use_extra_hire_dates:
        # Keep legacy behavior for hire orders: use user-entered dates only.
        replacements["{hire_date}"] = extra.get("{hire_date}", "")
        replacements["{contract_start}"] = extra.get("{contract_start}", "")

    # Backward-compatible alias used in hire templates.
    replacements["{hire_order_date}"] = replacements.get("{hire_date}", "")

    # Calculate trial period months
    trial_end_months = ""
    if use_extra_hire_dates:
        hd = _parse_date_like(extra_raw.get("hire_date"))
        td = _parse_date_like(extra_raw.get("trial_end"))
        if hd and td:
            months = (td.year - hd.year) * 12 + (td.month - hd.month)
            if months > 0:
                trial_end_months = str(months)

    # Calculate contract duration in years
    contract_end_years = ""
    if use_extra_hire_dates:
        hd = _parse_date_like(extra_raw.get("hire_date"))
        cd = _parse_date_like(extra_raw.get("contract_end"))
        if hd and cd:
            years = cd.year - hd.year
            if (cd.month, cd.day) < (hd.month, hd.day):
                years -= 1
            if years > 0:
                contract_end_years = str(years)

    replacements["{trial_end_months}"] = trial_end_months
    replacements["{contract_end_years}"] = contract_end_years

    return replacements


def build_notification_replacements(
    title: str,
    number: str,
    doc_date: Any,
    employee: Any = None,
    notification_type_name: str = "",
    notification_type_code: str = "",
    extra_fields: dict | None = None,
) -> dict[str, str]:
    """Build complete replacements for notification documents."""
    replacements = build_doc_base_replacements(title=title, number=number, doc_date=doc_date)
    replacements.update(build_template_replacements_for_employee(employee))
    replacements.update(build_extra_field_replacements(extra_fields))

    if notification_type_name:
        replacements["{notification_type_name}"] = notification_type_name
        replacements["{notification_type_code}"] = notification_type_code

    # For contract_extension, auto-fill old contract dates from employee if not in extra_fields
    if notification_type_code == "contract_extension" and employee:
        extra_raw = extra_fields or {}
        if not extra_raw.get("old_contract_start"):
            cs = getattr(employee, "contract_start", None)
            if cs:
                replacements["{old_contract_start}"] = _format_date_ddmmyyyy(cs)
        if not extra_raw.get("old_contract_end"):
            ce = getattr(employee, "contract_end", None)
            if ce:
                replacements["{old_contract_end}"] = _format_date_ddmmyyyy(ce)

    # Calculate contract duration in years for contract_extension notifications
    if notification_type_code == "contract_extension" and extra_fields:
        new_start = _parse_date_like(extra_fields.get("new_contract_start"))
        new_end = _parse_date_like(extra_fields.get("new_contract_end"))
        if new_start and new_end:
            years = new_end.year - new_start.year
            if (new_end.month, new_end.day) < (new_start.month, new_start.day):
                years -= 1
            if years > 0:
                replacements["{new_contract_years}"] = str(years)

    return replacements


def build_statement_replacements(
    title: str,
    number: str,
    doc_date: Any,
    employee: Any = None,
    statement_type_name: str = "",
    statement_type_code: str = "",
    extra_fields: dict | None = None,
) -> dict[str, str]:
    """Build complete replacements for statement documents."""
    replacements = build_doc_base_replacements(title=title, number=number, doc_date=doc_date)
    replacements.update(build_template_replacements_for_employee(employee))
    replacements.update(build_extra_field_replacements(extra_fields))

    if statement_type_name:
        replacements["{statement_type_name}"] = statement_type_name
        replacements["{statement_type_code}"] = statement_type_code

    # For contract_expiry, auto-fill contract start from employee
    if statement_type_code == "contract_expiry" and employee:
        extra_raw = extra_fields or {}
        cs = getattr(employee, "contract_start", None)
        if cs:
            replacements["{old_contract_start}"] = _format_date_ddmmyyyy(cs)

    return replacements


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
        "{oznak_gender}": emp_replacements.get("{oznak}", ""),
        "{initials_before}": emp_replacements.get("{initials_before}", ""),
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
