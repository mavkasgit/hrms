import io
from datetime import date
from unittest.mock import AsyncMock

import openpyxl
import pytest
from sqlalchemy import select

from app.api.import_employees import import_excel_confirm, parse_excel_sheet
from app.models.department import Department
from app.models.employee import Employee
from app.models.position import Position
from app.models.vacation_period import VacationPeriod


pytestmark = pytest.mark.asyncio(loop_scope="module")


def _build_excel_bytes(headers: list[str], rows: list[list[object]]) -> bytes:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(headers)
    for row in rows:
        sheet.append(row)

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _make_upload_file(content: bytes, filename: str = "employees.xlsx"):
    upload = AsyncMock()
    upload.filename = filename
    upload.read = AsyncMock(return_value=content)
    return upload


async def test_parse_excel_sheet_reads_headers_and_rows():
    content = _build_excel_bytes(
        ["Name", "Department", "Position"],
        [
            ["Alice Example", "IT", "Developer"],
            ["Bob Example", "QA", "Tester"],
        ],
    )

    headers, rows, total = await parse_excel_sheet(content)

    assert headers == ["Name", "Department", "Position"]
    assert rows == [
        ["Alice Example", "IT", "Developer"],
        ["Bob Example", "QA", "Tester"],
    ]
    assert total == 2


async def test_import_excel_confirm_creates_employees_and_vacation_periods(db_session):
    content = _build_excel_bytes(
        [
            "Name",
            "Tab",
            "Department",
            "Position",
            "HireDate",
            "BirthDate",
            "Gender",
            "Citizen",
            "Resident",
            "Pensioner",
            "PaymentForm",
            "Rate",
            "ContractStart",
            "ContractEnd",
            "PersonalNo",
            "InsuranceNo",
            "PassportNo",
            "AddDays",
        ],
        [
            [
                "Alice Example",
                "1001",
                "IT",
                "Developer",
                "2024-03-01",
                "1990-05-15",
                "F",
                "yes",
                "no",
                "false",
                "card",
                "0.5",
                "2024-03-01",
                "2025-03-01",
                "PN-001",
                "INS-001",
                "PP-001",
                "5",
            ],
            [
                "Bob Example",
                "1002",
                "IT",
                "Tester",
                "01.04.2024",
                "22.08.1992",
                "M",
                "no",
                "yes",
                "true",
                "cash",
                "1.0",
                "2024-04-01",
                "",
                "PN-002",
                "INS-002",
                "PP-002",
                "",
            ],
        ],
    )

    result = await import_excel_confirm(
        file=_make_upload_file(content),
        name="Name",
        tab_number="Tab",
        department="Department",
        position="Position",
        hire_date="HireDate",
        birth_date="BirthDate",
        gender="Gender",
        is_citizen_rb="Citizen",
        is_resident_rb="Resident",
        is_pensioner="Pensioner",
        payment_form="PaymentForm",
        rate="Rate",
        contract_start="ContractStart",
        contract_end="ContractEnd",
        personal_number="PersonalNo",
        insurance_number="InsuranceNo",
        passport_number="PassportNo",
        additional_vacation_days="AddDays",
        db=db_session,
        current_user="admin",
    )

    employees = list((await db_session.execute(select(Employee).order_by(Employee.tab_number))).scalars().all())
    departments = list((await db_session.execute(select(Department))).scalars().all())
    positions = list((await db_session.execute(select(Position).order_by(Position.name))).scalars().all())
    periods = list((await db_session.execute(select(VacationPeriod))).scalars().all())

    alice = next(emp for emp in employees if emp.tab_number == 1001)
    bob = next(emp for emp in employees if emp.tab_number == 1002)

    assert result == {"created": 2, "updated": 0, "skipped": 0, "total": 2}
    assert len(employees) == 2
    assert len(departments) == 1
    assert len(positions) == 2
    assert len(periods) >= 2

    assert alice.name == "Alice Example"
    assert alice.hire_date == date(2024, 3, 1)
    assert alice.birth_date == date(1990, 5, 15)
    assert alice.gender is not None
    assert alice.citizenship is True
    assert alice.residency is False
    assert alice.pensioner is False
    assert alice.payment_form == "card"
    assert alice.rate == 0.5
    assert alice.contract_start == date(2024, 3, 1)
    assert alice.contract_end == date(2025, 3, 1)
    assert alice.personal_number == "PN-001"
    assert alice.insurance_number == "INS-001"
    assert alice.passport_number == "PP-001"
    assert alice.additional_vacation_days == 5

    assert bob.gender is not None
    assert bob.gender != alice.gender
    assert bob.citizenship is False
    assert bob.residency is True
    assert bob.pensioner is True
    assert bob.additional_vacation_days == 0


async def test_import_excel_confirm_updates_existing_employee_by_tab_number(
    db_session,
    create_department,
    create_position,
    create_employee,
):
    old_department = await create_department(name="Legacy Department")
    old_position = await create_position(name="Legacy Position")
    employee = await create_employee(
        name="Alice Example",
        tab_number=1001,
        department=old_department,
        position=old_position,
        contract_start=None,
        additional_vacation_days=0,
    )

    content = _build_excel_bytes(
        ["Name", "Tab", "Department", "Position", "ContractStart", "AddDays"],
        [["Alice Example", "1001", "Operations", "Lead", "2024-06-01", "7"]],
    )

    result = await import_excel_confirm(
        file=_make_upload_file(content),
        name="Name",
        tab_number="Tab",
        department="Department",
        position="Position",
        contract_start="ContractStart",
        additional_vacation_days="AddDays",
        db=db_session,
        current_user="admin",
    )

    refreshed_employee = (await db_session.execute(select(Employee).where(Employee.id == employee.id))).scalar_one()
    employees = list((await db_session.execute(select(Employee))).scalars().all())
    updated_periods = list(
        (
            await db_session.execute(
                select(VacationPeriod).where(VacationPeriod.employee_id == employee.id)
            )
        ).scalars().all()
    )

    assert result == {"created": 0, "updated": 1, "skipped": 0, "total": 1}
    assert len(employees) == 1
    assert refreshed_employee.contract_start == date(2024, 6, 1)
    assert refreshed_employee.additional_vacation_days == 7
    assert refreshed_employee.department_id != old_department.id
    assert refreshed_employee.position_id != old_position.id
    assert len(updated_periods) >= 1


async def test_import_excel_confirm_skips_blank_names_and_defaults_invalid_optional_values(
    db_session,
):
    content = _build_excel_bytes(
        ["Name", "Department", "Position", "AddDays", "Rate"],
        [
            ["", "IT", "Developer", "3", "1.0"],
            ["Charlie Example", "Support", "Agent", "oops", "bad-float"],
        ],
    )

    result = await import_excel_confirm(
        file=_make_upload_file(content),
        name="Name",
        department="Department",
        position="Position",
        additional_vacation_days="AddDays",
        rate="Rate",
        db=db_session,
        current_user="admin",
    )

    employees = list((await db_session.execute(select(Employee))).scalars().all())

    assert result == {"created": 1, "updated": 0, "skipped": 1, "total": 1}
    assert len(employees) == 1
    assert employees[0].name == "Charlie Example"
    assert employees[0].additional_vacation_days == 0
    assert employees[0].rate is None
