"""Tests for Excel import functionality"""
import pytest
import io
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture
def mock_db():
    db = AsyncMock(spec=AsyncSession)
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.add = MagicMock()
    return db


@pytest.fixture
def test_file():
    """Create a minimal test Excel file"""
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    
    # Headers
    headers = ["ФИО", "Табельный номер", "Подразделение", "Должность", 
               "Дата приёма", "Дата рождения", "Пол", "Доп. дни отпуска"]
    for col, header in enumerate(headers, 1):
        ws.cell(row=1, column=col, value=header)
    
    # Data rows
    data = [
        ["Иванов Иван Иванович", "1001", "IT отдел", "Разработчик", 
         "01.03.2023", "15.05.1990", "М", "5"],
        ["Петрова Мария Сергеевна", "1002", "Бухгалтерия", "Бухгалтер", 
         "15.06.2022", "22.08.1985", "Ж", "3"],
        ["Сидоров Алексей Петрович", "1003", "IT отдел", "Тестировщик", 
         "10.01.2024", "30.12.1992", "М", ""],
    ]
    
    for row_idx, row_data in enumerate(data, 2):
        for col_idx, value in enumerate(row_data, 1):
            ws.cell(row=row_idx, column=col_idx, value=value)
    
    # Save to bytes
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


class TestParseExcel:
    """Test Excel parsing functionality"""
    
    @pytest.mark.asyncio
    async def test_parse_excel_headers(self):
        """Test that Excel headers are correctly extracted"""
        from app.api.import_employees import parse_excel_sheet

        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["ФИО", "Табельный номер", "Подразделение", "Должность"])
        ws.append(["Иванов", "1001", "IT", "Разработчик"])

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        headers, rows, total = await parse_excel_sheet(buffer.getvalue())

        assert len(headers) == 4
        assert headers[0] == "ФИО"
        assert headers[1] == "Табельный номер"
        assert len(rows) == 1
        assert total == 1

    @pytest.mark.asyncio
    async def test_parse_excel_empty_rows(self):
        """Test handling of empty rows"""
        from app.api.import_employees import parse_excel_sheet
        
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["ФИО", "Должность"])
        ws.append(["Иванов", "Разработчик"])
        ws.append([None, None])  # Empty row
        ws.append(["Петров", "Тестировщик"])
        
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        headers, rows, total = await parse_excel_sheet(buffer.getvalue())

        assert len(rows) == 3  # Including empty row
        assert total == 3


class TestImportExcelEndpoint:
    """Test the /import/excel endpoint"""
    
    @pytest.mark.asyncio
    async def test_import_excel_valid_file(self, test_file):
        """Test importing a valid Excel file"""
        from app.api.import_employees import router
        from fastapi import FastAPI
        
        app = FastAPI()
        app.include_router(router)
        
        client = TestClient(app)
        
        test_file.seek(0)
        response = client.post(
            "/import/excel",
            files={"file": ("test.xlsx", test_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "headers" in data
        assert "rows" in data
        assert data["row_count"] == 3
        assert len(data["headers"]) == 8
    
    @pytest.mark.asyncio
    async def test_import_excel_invalid_extension(self):
        """Test that non-Excel files are rejected"""
        from app.api.import_employees import router
        from fastapi import FastAPI
        
        app = FastAPI()
        app.include_router(router)
        
        client = TestClient(app)
        
        response = client.post(
            "/import/excel",
            files={"file": ("test.txt", b"not an excel file", "text/plain")}
        )
        
        assert response.status_code == 400


class TestImportExcelConfirm:
    """Test the import confirmation endpoint"""
    
    @pytest.mark.asyncio
    async def test_import_crenew_employee(self, test_file):
        """Test that import creates new employees"""
        from app.api.import_employees import import_excel_confirm
        from app.models.department import Department
        from app.models.position import Position
        from app.models.employee import Employee
        
        # Create a proper mock database
        mock_db = AsyncMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        
        created_departments = []
        created_positions = []
        created_employees = []
        
        def mock_add(obj):
            if isinstance(obj, Department):
                obj.id = len(created_departments) + 1
                created_departments.append(obj)
            elif isinstance(obj, Position):
                obj.id = len(created_positions) + 1
                created_positions.append(obj)
            elif isinstance(obj, Employee):
                obj.id = len(created_employees) + 1
                created_employees.append(obj)
        
        mock_db.add = mock_add
        
        async def mock_execute(query):
            result_mock = MagicMock()
            result_mock.scalar_one_or_none.return_value = None
            return result_mock
        
        mock_db.execute = mock_execute
        
        test_file.seek(0)
        mock_file = MagicMock()
        mock_file.read = AsyncMock(return_value=test_file.getvalue())
        
        result = await import_excel_confirm(
            file=mock_file,
            name="ФИО",
            tab_number="Табельный номер",
            department="Подразделение",
            position="Должность",
            hire_date="Дата приёма",
            birth_date="Дата рождения",
            gender="Пол",
            additional_vacation_days="Доп. дни отпуска",
            db=mock_db,
            current_user="admin"
        )
        
        assert result["created"] > 0 or result["updated"] > 0
        assert result["total"] > 0
        assert len(created_employees) > 0
    
    @pytest.mark.asyncio
    async def test_import_skip_empty_name(self, mock_db):
        """Test that rows without names are skipped"""
        from app.api.import_employees import import_excel_confirm
        import openpyxl
        
        # Create file with empty name
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["ФИО", "Подразделение", "Должность"])
        ws.append(["", "IT", "Разработчик"])  # Empty name
        
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        mock_file = MagicMock()
        mock_file.read = AsyncMock(return_value=buffer.getvalue())
        
        result = await import_excel_confirm(
            file=mock_file,
            name="ФИО",
            department="Подразделение",
            position="Должность",
            db=mock_db,
            current_user="admin"
        )
        
        assert result["total"] == 0
    
    @pytest.mark.asyncio
    async def test_import_update_existing_employee(self, test_file):
        """Test that import updates existing employees"""
        from app.api.import_employees import import_excel_confirm
        from app.models.employee import Employee
        from app.models.department import Department
        from app.models.position import Position
        
        # Create mock database
        mock_db = AsyncMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        
        created_departments = []
        created_positions = []
        
        def mock_add(obj):
            if isinstance(obj, Department):
                obj.id = len(created_departments) + 1
                created_departments.append(obj)
            elif isinstance(obj, Position):
                obj.id = len(created_positions) + 1
                created_positions.append(obj)
        
        mock_db.add = mock_add
        
        # Mock to return existing employee only for Employee queries
        existing_employee = MagicMock()
        existing_employee.id = 1
        existing_employee.name = "Иванов Иван Иванович"
        existing_employee.tab_number = 1001
        existing_employee.department_id = None
        existing_employee.position_id = None
        existing_employee.hire_date = None
        existing_employee.birth_date = None
        existing_employee.gender = None
        existing_employee.additional_vacation_days = 0
        existing_employee.is_deleted = False
        
        call_count = 0
        
        async def mock_execute(query):
            nonlocal call_count
            result_mock = MagicMock()
            call_count += 1
            # First two calls are for Department and Position (return None to create new)
            # After flush, Employee query should return existing employee
            if call_count > 2 and "Employee" in str(query):
                result_mock.scalar_one_or_none = MagicMock(return_value=existing_employee)
            else:
                result_mock.scalar_one_or_none = MagicMock(return_value=None)
            return result_mock
        
        mock_db.execute = mock_execute
        
        test_file.seek(0)
        mock_file = MagicMock()
        mock_file.read = AsyncMock(return_value=test_file.getvalue())
        
        result = await import_excel_confirm(
            file=mock_file,
            name="ФИО",
            tab_number="Табельный номер",
            department="Подразделение",
            position="Должность",
            hire_date="Дата приёма",
            birth_date="Дата рождения",
            gender="Пол",
            additional_vacation_days="Доп. дни отпуска",
            db=mock_db,
            current_user="admin"
        )
        
        # Should have created or updated at least one employee
        assert result["total"] > 0
        # Verify commit was called
        mock_db.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_import_date_parsing(self, test_file):
        """Test that dates are correctly parsed from Excel"""
        from app.api.import_employees import import_excel_confirm
        from app.models.employee import Employee
        from app.models.department import Department
        from app.models.position import Position
        
        mock_db = AsyncMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        
        created_departments = []
        created_positions = []
        created_employees = []
        
        def mock_add(obj):
            if isinstance(obj, Department):
                obj.id = len(created_departments) + 1
                created_departments.append(obj)
            elif isinstance(obj, Position):
                obj.id = len(created_positions) + 1
                created_positions.append(obj)
            elif isinstance(obj, Employee):
                obj.id = len(created_employees) + 1
                created_employees.append(obj)
        
        mock_db.add = mock_add
        
        async def mock_execute(query):
            result_mock = MagicMock()
            result_mock.scalar_one_or_none = MagicMock(return_value=None)
            return result_mock
        
        mock_db.execute = mock_execute
        
        test_file.seek(0)
        mock_file = MagicMock()
        mock_file.read = AsyncMock(return_value=test_file.getvalue())
        
        await import_excel_confirm(
            file=mock_file,
            name="ФИО",
            tab_number="Табельный номер",
            department="Подразделение",
            position="Должность",
            hire_date="Дата приёма",
            birth_date="Дата рождения",
            gender="Пол",
            additional_vacation_days="Доп. дни отпуска",
            db=mock_db,
            current_user="admin"
        )
        
        # Check that at least one employee was created
        assert len(created_employees) > 0
        
        # Check that dates are parsed correctly
        first_employee = created_employees[0]
        assert first_employee.hire_date is not None
        assert first_employee.birth_date is not None
        assert first_employee.gender == "М"
        assert first_employee.additional_vacation_days == 5
    
    @pytest.mark.asyncio
    async def test_import_with_empty_optional_fields(self):
        """Test import with empty optional fields"""
        from app.api.import_employees import import_excel_confirm
        from app.models.employee import Employee
        from app.models.department import Department
        from app.models.position import Position
        
        # Create file with minimal data
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["ФИО", "Подразделение", "Должность", "Доп. дни отпуска"])
        ws.append(["Иванов Иван", "IT", "Разработчик", ""])  # Empty vacation days
        
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        mock_db = AsyncMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        
        created_departments = []
        created_positions = []
        created_employees = []
        
        def mock_add(obj):
            if isinstance(obj, Department):
                obj.id = len(created_departments) + 1
                created_departments.append(obj)
            elif isinstance(obj, Position):
                obj.id = len(created_positions) + 1
                created_positions.append(obj)
            elif isinstance(obj, Employee):
                obj.id = len(created_employees) + 1
                created_employees.append(obj)
        
        mock_db.add = mock_add
        
        async def mock_execute(query):
            result_mock = MagicMock()
            result_mock.scalar_one_or_none = MagicMock(return_value=None)
            return result_mock
        
        mock_db.execute = mock_execute
        
        mock_file = MagicMock()
        mock_file.read = AsyncMock(return_value=buffer.getvalue())
        
        result = await import_excel_confirm(
            file=mock_file,
            name="ФИО",
            department="Подразделение",
            position="Должность",
            additional_vacation_days="Доп. дни отпуска",
            db=mock_db,
            current_user="admin"
        )
        
        assert result["created"] == 1
        assert len(created_employees) == 1
        assert created_employees[0].additional_vacation_days == 0
