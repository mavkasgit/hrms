from datetime import date
from types import SimpleNamespace

from app.services.template_replacements import (
    build_notification_replacements,
    build_order_replacements,
    build_statement_replacements,
)
from app.services.template_variables_service import get_template_variables


def _employee(
    *,
    name: str = "Божков Олег Леонидович",
    gender: str = "male",
    hire_date: date | None = date(2020, 1, 15),
    contract_start: date | None = date(2020, 1, 20),
):
    return SimpleNamespace(
        name=name,
        gender=gender,
        tab_number="123",
        position=SimpleNamespace(name="Инженер"),
        department=SimpleNamespace(name="ИТ"),
        hire_date=hire_date,
        contract_start=contract_start,
    )


def _names_by_doc_type(doc_type: str) -> set[str]:
    return {item["name"] for item in get_template_variables(doc_type)}


def test_build_order_replacements_has_unified_and_legacy_keys():
    replacements = build_order_replacements(
        order_number="15",
        order_date=date(2026, 5, 20),
        order_type_name="Прием на работу",
        order_type_code="hire",
        employee=_employee(),
        extra_fields={
            "hire_date": "2026-05-01",
            "contract_start": "2026-05-01",
            "trial_end": "2026-08-01",
            "contract_end": "2027-05-01",
        },
        notes="Комментарий",
    )

    assert replacements["{doc_number}"] == "15"
    assert replacements["{doc_date}"] == "20.05.2026"
    assert replacements["{order_number}"] == "15"
    assert replacements["{order_date}"] == "20.05.2026"
    assert replacements["{initials_before}"] == "О.Л.Божков"
    assert replacements["{oznak_gender}"] == "ознакомлен"
    assert replacements["{hire_order_date}"] == "01.05.2026"
    assert replacements["{trial_end_months}"] == "3"
    assert replacements["{contract_end_years}"] == "1"


def test_build_order_replacements_hire_without_extra_dates_keeps_legacy_blank_behavior():
    replacements = build_order_replacements(
        order_number="16",
        order_date=date(2026, 5, 20),
        order_type_name="Прием на работу",
        order_type_code="hire",
        employee=_employee(),
        extra_fields=None,
    )

    assert replacements["{hire_date}"] == ""
    assert replacements["{contract_start}"] == ""
    assert replacements["{hire_order_date}"] == ""


def test_build_order_replacements_non_hire_uses_employee_dates():
    replacements = build_order_replacements(
        order_number="17",
        order_date=date(2026, 5, 20),
        order_type_name="Перевод",
        order_type_code="transfer",
        employee=_employee(),
        extra_fields=None,
    )

    assert replacements["{hire_date}"] == "15.01.2020"
    assert replacements["{contract_start}"] == "20.01.2020"
    assert replacements["{hire_order_date}"] == "15.01.2020"


def test_build_notification_and_statement_replacements_have_common_placeholders():
    employee = _employee()
    doc_date = date(2026, 5, 20)

    notification_replacements = build_notification_replacements(
        title="Уведомление",
        number="18",
        doc_date=doc_date,
        employee=employee,
    )
    statement_replacements = build_statement_replacements(
        title="Заявление",
        number="19",
        doc_date=doc_date,
        employee=employee,
    )

    assert notification_replacements["{doc_number}"] == "18"
    assert notification_replacements["{doc_date}"] == "20.05.2026"
    assert notification_replacements["{initials_before}"] == "О.Л.Божков"
    assert statement_replacements["{doc_number}"] == "19"
    assert statement_replacements["{doc_date}"] == "20.05.2026"
    assert statement_replacements["{initials_before}"] == "О.Л.Божков"


def test_template_variables_expose_unified_doc_placeholders_for_all_doc_types():
    notification_names = _names_by_doc_type("notification")
    statement_names = _names_by_doc_type("statement")

    for names in (notification_names, statement_names):
        assert "{doc_number}" in names
        assert "{doc_date}" in names
        assert "{initials_before}" in names
