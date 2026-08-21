import io
import re
from datetime import date
from urllib.parse import unquote

import openpyxl
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.main import app

pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest.fixture
async def async_client(db_session: AsyncSession):
    """ASGI client bound to the same db_session (savepoint-safe)."""

    async def override_get_db():
        try:
            yield db_session
        finally:
            await db_session.commit()

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


def _auth_headers():
    return {"Authorization": "Bearer admin"}


def _read_sheet(content: bytes) -> tuple[list[str], list[list]]:
    workbook = openpyxl.load_workbook(io.BytesIO(content))
    sheet = workbook.active
    assert sheet is not None, "Нет активного листа"
    rows = list(sheet.iter_rows(values_only=True))
    assert rows, "Пустой лист — нет ни заголовков, ни данных"
    headers = [str(value) if value is not None else "" for value in rows[0]]
    return headers, [list(row) for row in rows[1:]]


async def test_export_returns_xlsx_with_employees_and_vacation_balances(
    db_session: AsyncSession,
    async_client: AsyncClient,
    create_department,
    create_position,
    create_employee,
    create_vacation_period,
):
    department = await create_department(name="IT")
    position = await create_position(name="Developer")

    active = await create_employee(
        name="Активный Сотрудник",
        tab_number=1001,
        department=department,
        position=position,
        hire_date=None,
        contract_start=date(2024, 3, 1),
        contract_end=date(2025, 3, 1),
        birth_date=date(1990, 5, 15),
        gender="М",
        rate=1.0,
        additional_vacation_days=0,
    )
    dismissed = await create_employee(
        name="Уволенный Сотрудник",
        tab_number=1002,
        department=department,
        position=position,
        hire_date=date(2020, 1, 1),
        is_dismissed=True,
        dismissal_date=date(2024, 12, 31),
        dismissal_reason="По собственному желанию",
    )
    await create_employee(
        name="Удалённый Сотрудник",
        tab_number=1003,
        department=department,
        position=position,
        is_deleted=True,
    )
    await create_vacation_period(
        employee=active,
        period_start=date(2020, 1, 1),
        period_end=date(2020, 12, 31),
        main_days=24,
        used_days=0,
        remaining_days=7,
        year_number=1,
    )

    resp = await async_client.get("/api/employees/export", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    filename_match = re.search(r"filename\*=UTF-8''([^;]+)", resp.headers["content-disposition"])
    assert filename_match is not None
    assert unquote(filename_match.group(1)) == f"Сотрудники_{date.today().isoformat()}.xlsx"

    headers, rows = _read_sheet(resp.content)
    assert "ФИО" in headers
    assert "Начало контракта" in headers
    assert "Конец контракта" in headers
    assert "Остаток отпуска" in headers

    name_idx = headers.index("ФИО")
    remaining_idx = headers.index("Остаток отпуска")
    contract_start_idx = headers.index("Начало контракта")

    names = [row[name_idx] for row in rows]
    assert "Активный Сотрудник" in names
    assert "Уволенный Сотрудник" in names
    assert "Удалённый Сотрудник" not in names

    active_row = next(row for row in rows if row[name_idx] == "Активный Сотрудник")
    dismissed_row = next(row for row in rows if row[name_idx] == "Уволенный Сотрудник")

    assert active_row[remaining_idx] == 7
    assert dismissed_row[remaining_idx] is not None

    contract_start = active_row[contract_start_idx]
    assert contract_start is not None
    assert contract_start.date() == date(2024, 3, 1)


async def test_export_requires_auth(async_client: AsyncClient):
    resp = await async_client.get("/api/employees/export")
    assert resp.status_code == 401