from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import io
import os

from app.core.database import get_db
from app.models.department import Department
from app.models.position import Position
from app.models.employee import Employee
from app.services.vacation_period_service import VacationPeriodService

router = APIRouter(prefix="/import", tags=["import"])


def _get_current_user_stub() -> str:
    return "admin"


class ColumnMapping(BaseModel):
    name: Optional[str] = None
    tab_number: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    hire_date: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    additional_vacation_days: Optional[str] = None


async def get_excel_sheets_info(content: bytes) -> list[dict]:
    """Возвращает информацию о всех листах Excel файла."""
    from io import BytesIO
    from python_calamine import CalamineWorkbook
    
    filelike = BytesIO(content)
    wb = CalamineWorkbook.from_filelike(filelike)
    
    sheets = []
    for i, name in enumerate(wb.sheet_names):
        sheet = wb.get_sheet_by_index(i)
        data = list(sheet.to_python())
        row_count = len(data) - 1 if data else 0  # минус заголовок
        sheets.append({
            "index": i,
            "name": name,
            "row_count": max(0, row_count),
        })
    
    return sheets


async def parse_excel_sheet(
    content: bytes,
    sheet_index: int = 0,
    column_indices: Optional[list[int]] = None,
) -> tuple[list[str], list[list[str]], int]:
    """Парсит конкретный лист Excel файла.
    
    Args:
        content: байты файла
        sheet_index: индекс листа (0-based)
        column_indices: индексы колонок для извлечения (если None - все)
    
    Returns:
        (headers, rows, total_rows)
    """
    import logging
    from io import BytesIO
    
    try:
        from python_calamine import CalamineWorkbook
    except ImportError:
        raise HTTPException(status_code=500, detail="python-calamine not installed. Install with: pip install python-calamine")
    
    try:
        filelike = BytesIO(content)
        wb = CalamineWorkbook.from_filelike(filelike)
        
        if sheet_index < 0 or sheet_index >= len(wb.sheet_names):
            raise HTTPException(
                status_code=400, 
                detail=f"Лист с индексом {sheet_index} не найден. Доступные: {wb.sheet_names}"
            )
        
        sheet = wb.get_sheet_by_index(sheet_index)
        data = list(sheet.to_python())
        
        if not data:
            return [], [], 0
        
        # Первая строка - заголовки
        all_headers = [str(cell) if cell is not None else "" for cell in data[0]]
        
        # Фильтрация по колонкам
        if column_indices:
            headers = [all_headers[i] for i in column_indices if i < len(all_headers)]
            rows = []
            for row in data[1:]:
                filtered_row = [str(row[i]) if row[i] is not None else "" for i in column_indices if i < len(row)]
                rows.append(filtered_row)
        else:
            headers = all_headers
            rows = []
            for row in data[1:]:
                rows.append([str(cell) if cell is not None else "" for cell in row])
        
        return headers, rows, len(rows)
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Excel parse error: {e}")
        raise HTTPException(status_code=400, detail=f"Ошибка парсинга Excel файла: {str(e)}")


@router.get("/excel/template")
async def download_template():
    """Скачать шаблон Excel для импорта сотрудников."""
    # import_employees.py is in app/api/, template is in app/
    api_dir = os.path.dirname(__file__)
    app_dir = os.path.dirname(api_dir)
    template_path = os.path.join(app_dir, "template_employees.xlsx")

    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail="Шаблон не найден. Обратитесь к администратору.")

    return FileResponse(
        path=template_path,
        filename="Шаблон_импорт_сотрудников.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/excel")
async def import_excel(
    file: UploadFile = File(...),
    sheet_index: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Парсит Excel файл и возвращает информацию о листах и preview."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Только .xlsx или .xls файлы")

    content = await file.read()
    
    # Получаем информацию о всех листах
    sheets = await get_excel_sheets_info(content)
    
    # Парсим указанный лист
    headers, rows, total_rows = await parse_excel_sheet(content, sheet_index)
    
    return {
        "sheets": sheets,
        "current_sheet_index": sheet_index,
        "current_sheet_name": sheets[sheet_index]["name"] if sheet_index < len(sheets) else "",
        "headers": headers,
        "rows": rows,
        "row_count": total_rows,
    }


@router.post("/excel/preview")
async def import_excel_preview(
    file: UploadFile = File(...),
    sheet_index: int = 0,
    name: Optional[str] = None,
    tab_number: Optional[str] = None,
    department: Optional[str] = None,
    position: Optional[str] = None,
    hire_date: Optional[str] = None,
    birth_date: Optional[str] = None,
    gender: Optional[str] = None,
    additional_vacation_days: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Показывает preview того, что будет импортировано."""
    content = await file.read()
    headers, rows, total_rows = await parse_excel_sheet(content, sheet_index)

    col_idx = {h: i for i, h in enumerate(headers)}

    def get_col(col_name: Optional[str]) -> Optional[int]:
        if col_name is None:
            return None
        return col_idx.get(col_name)

    preview = []
    for row in rows[:5]:  # Первые 5 для preview
        name_val = row[get_col(name)] if name and get_col(name) is not None else ""
        if not name_val:
            continue

        preview.append({
            "name": name_val.strip(),
            "tab_number": row[get_col(tab_number)] if tab_number and get_col(tab_number) is not None else None,
            "department": row[get_col(department)] if department and get_col(department) is not None else None,
            "position": row[get_col(position)] if position and get_col(position) is not None else None,
            "hire_date": row[get_col(hire_date)] if hire_date and get_col(hire_date) is not None else None,
            "birth_date": row[get_col(birth_date)] if birth_date and get_col(birth_date) is not None else None,
            "gender": row[get_col(gender)] if gender and get_col(gender) is not None else None,
            "additional_vacation_days": row[get_col(additional_vacation_days)] if additional_vacation_days and get_col(additional_vacation_days) is not None else None,
        })

    return {"preview": preview, "total_rows": total_rows}


@router.post("/excel/confirm")
async def import_excel_confirm(
    file: UploadFile = File(...),
    sheet_index: int = 0,
    name: Optional[str] = None,
    tab_number: Optional[str] = None,
    department: Optional[str] = None,
    position: Optional[str] = None,
    hire_date: Optional[str] = None,
    birth_date: Optional[str] = None,
    gender: Optional[str] = None,
    is_citizen_rb: Optional[str] = None,
    is_resident_rb: Optional[str] = None,
    is_pensioner: Optional[str] = None,
    payment_form: Optional[str] = None,
    rate: Optional[str] = None,
    contract_start: Optional[str] = None,
    contract_end: Optional[str] = None,
    personal_number: Optional[str] = None,
    insurance_number: Optional[str] = None,
    passport_number: Optional[str] = None,
    additional_vacation_days: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Подтверждает импорт и создаёт записи в БД."""
    content = await file.read()
    headers, rows, total_rows = await parse_excel_sheet(content, sheet_index)

    # Remove empty first column if present (from template)
    if headers and headers[0].strip() == '':
        headers = headers[1:]
        rows = [row[1:] for row in rows]

    print(f"[IMPORT] Headers: {headers}")
    print(f"[IMPORT] Total rows: {total_rows}, Mapping params: name={name}, dept={department}, pos={position}")

    col_idx = {h: i for i, h in enumerate(headers)}
    print(f"[IMPORT] Column index map: {col_idx}")
    
    # Validate that at least name, department, position are mapped
    if not name or not department or not position:
        raise HTTPException(status_code=400, detail="Обязательные поля не сопоставлены: ФИО, Подразделение, Должность")

    def get_val(row: list, col_name: Optional[str]) -> Optional[str]:
        if col_name is None:
            return None
        idx = col_idx.get(col_name)
        if idx is None or idx >= len(row):
            return None
        val = row[idx]
        return str(val).strip() if val else None

    def parse_date(val: Optional[str]) -> Optional[object]:
        """Parse date string and return datetime.date object (not string)."""
        if not val:
            return None
        from datetime import datetime, date
        
        # If already a date object, return it
        if isinstance(val, date):
            return val
        
        # Convert to string
        val_str = str(val).strip()
        if not val_str:
            return None
        
        # Try parsing as Excel serial date (number of days since 1900-01-01)
        try:
            excel_date = float(val_str)
            # Excel incorrectly treats 1900 as a leap year, so we need to adjust
            if excel_date > 59:
                excel_date -= 1
            from datetime import timedelta
            return date(1899, 12, 31) + timedelta(days=excel_date)
        except (ValueError, OverflowError):
            pass
        
        # Try common date formats
        for fmt in ["%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"]:
            try:
                return datetime.strptime(val_str, fmt).date()
            except ValueError:
                continue
        
        return None

    created = 0
    updated = 0
    skipped = 0
    imported_employees = []  # Список для отслеживания импортированных сотрудников

    for i, row in enumerate(rows):
        name_val = get_val(row, name)
        if not name_val:
            skipped += 1
            if i < 3:
                print(f"[IMPORT] Row {i}: skipped (no name), row={row[:5]}")
            continue

        name_str = name_val.strip()
        if i < 3:
            print(f"[IMPORT] Row {i}: name='{name_str}'")

        # Tab number
        tab_str = get_val(row, tab_number)
        tab = None
        if tab_str:
            try:
                tab = int(tab_str)
            except ValueError:
                tab = None

        # Department
        dept_id = None
        dept_val = get_val(row, department)
        if i < 3:
            print(f"[IMPORT] Row {i}: dept_col='{department}', dept_idx={col_idx.get(department)}, dept_val='{dept_val}'")
        if dept_val:
            result = await db.execute(select(Department).where(Department.name == dept_val))
            dept = result.scalar_one_or_none()
            if not dept:
                dept = Department(name=dept_val)
                db.add(dept)
                await db.flush()
            dept_id = dept.id

        # Position
        pos_id = None
        pos_val = get_val(row, position)
        if i < 3:
            print(f"[IMPORT] Row {i}: pos_col='{position}', pos_idx={col_idx.get(position)}, pos_val='{pos_val}'")
        if pos_val:
            result = await db.execute(select(Position).where(Position.name == pos_val))
            pos = result.scalar_one_or_none()
            if not pos:
                pos = Position(name=pos_val)
                db.add(pos)
                await db.flush()
            pos_id = pos.id

        # Skip if no department/position (required)
        if not dept_id or not pos_id:
            skipped += 1
            if i < 3:
                print(f"[IMPORT] Row {i}: skipped (no dept={dept_id} or pos={pos_id})")
            continue

        # Dates
        hire = parse_date(get_val(row, hire_date))
        birth = parse_date(get_val(row, birth_date))
        contract_start_date = parse_date(get_val(row, contract_start))
        contract_end_date = parse_date(get_val(row, contract_end))
        
        if i < 3:
            print(f"[IMPORT] Row {i}: RAW dates - hire={get_val(row, hire_date)}, birth={get_val(row, birth_date)}")
            print(f"[IMPORT] Row {i}: RAW contract - start={get_val(row, contract_start)}, end={get_val(row, contract_end)}")
            print(f"[IMPORT] Row {i}: PARSED dates - hire={hire}, birth={birth}, contract_start={contract_start_date}, contract_end={contract_end_date}")

        # Gender
        emp_gender = None
        g = get_val(row, gender)
        if g:
            g = g.upper()[0]
            emp_gender = "М" if g in ["М", "M"] else "Ж" if g in ["Ж", "F"] else None

        # Boolean fields
        def parse_bool(val: Optional[str]) -> Optional[bool]:
            if not val:
                return None
            v = val.lower().strip()
            if v in ["да", "yes", "true", "1", "+"]:
                return True
            if v in ["нет", "no", "false", "0", "-"]:
                return False
            return None

        citizen_rb = parse_bool(get_val(row, is_citizen_rb))
        resident_rb = parse_bool(get_val(row, is_resident_rb))
        pensioner = parse_bool(get_val(row, is_pensioner))

        # Rate
        rate_val = None
        rate_str = get_val(row, rate)
        if rate_str:
            try:
                rate_val = float(rate_str)
            except ValueError:
                rate_val = None

        # Additional vacation days
        add_vac_days = 0
        add_vac_str = get_val(row, additional_vacation_days)
        if add_vac_str:
            try:
                add_vac_days = int(add_vac_str)
            except ValueError:
                add_vac_days = 0

        # Additional fields
        payment_form_val = get_val(row, payment_form)
        personal_num = get_val(row, personal_number)
        insurance_num = get_val(row, insurance_number)
        passport_num = get_val(row, passport_number)
        
        if i < 3:
            print(f"[IMPORT] Row {i}: RAW additional fields:")
            print(f"  payment_form={payment_form_val}, rate={rate_str}")
            print(f"  personal={personal_num}, insurance={insurance_num}, passport={passport_num}")

        # Find existing employee
        emp = None
        if tab:
            result = await db.execute(
                select(Employee).where(Employee.tab_number == tab)
            )
            emp = result.scalar_one_or_none()

        if not emp:
            result = await db.execute(
                select(Employee).where(Employee.name == name_str, Employee.is_deleted == False)
            )
            emp = result.scalar_one_or_none()

        if emp:
            # Update existing - explicitly set all fields
            emp.department_id = dept_id
            emp.position_id = pos_id
            emp.hire_date = hire
            emp.birth_date = birth
            emp.gender = emp_gender
            emp.citizenship = citizen_rb if citizen_rb is not None else emp.citizenship
            emp.residency = resident_rb if resident_rb is not None else emp.residency
            emp.pensioner = pensioner if pensioner is not None else emp.pensioner
            emp.payment_form = payment_form_val
            emp.rate = rate_val
            emp.contract_start = contract_start_date
            emp.contract_end = contract_end_date
            emp.personal_number = personal_num
            emp.insurance_number = insurance_num
            emp.passport_number = passport_num
            emp.additional_vacation_days = add_vac_days
            if i < 3:
                print(f"[IMPORT] Row {i}: UPDATED employee id={emp.id}")
                print(f"  payment_form={payment_form_val}, rate={rate_val}")
                print(f"  contract: {contract_start_date} - {contract_end_date}")
                print(f"  personal={personal_num}, insurance={insurance_num}, passport={passport_num}")
            updated += 1
            imported_employees.append(emp)  # Добавляем в список для создания периодов
        else:
            # Create new
            if i < 3:
                print(f"[IMPORT] Row {i}: CREATING new employee with data:")
                print(f"  name={name_str}, tab={tab}, dept_id={dept_id}, pos_id={pos_id}")
                print(f"  hire={hire}, birth={birth}, gender={emp_gender}")
                print(f"  citizen={citizen_rb}, resident={resident_rb}, pensioner={pensioner}")
                print(f"  payment_form={payment_form_val}, rate={rate_val}")
                print(f"  contract: {contract_start_date} - {contract_end_date}")
                print(f"  personal={personal_num}, insurance={insurance_num}, passport={passport_num}")
            emp = Employee(
                name=name_str,
                tab_number=tab,
                department_id=dept_id,
                position_id=pos_id,
                hire_date=hire,
                birth_date=birth,
                gender=emp_gender,
                citizenship=citizen_rb,
                residency=resident_rb,
                pensioner=pensioner,
                payment_form=payment_form_val,
                rate=rate_val,
                contract_start=contract_start_date,
                contract_end=contract_end_date,
                personal_number=personal_num,
                insurance_number=insurance_num,
                passport_number=passport_num,
                additional_vacation_days=add_vac_days,
            )
            db.add(emp)
            await db.flush()  # Flush чтобы получить ID
            created += 1
            imported_employees.append(emp)  # Добавляем в список для создания периодов

    await db.commit()

    print(f"[IMPORT] Result: created={created}, updated={updated}, skipped={skipped}, total={total_rows}")

    # Создаём периоды отпусков для всех импортированных сотрудников
    if imported_employees:
        from app.services.vacation_period_service import vacation_period_service
        print(f"[IMPORT] Creating vacation periods for {len(imported_employees)} employees...")
        
        for emp in imported_employees:
            if emp.contract_start:
                try:
                    await vacation_period_service.ensure_periods_for_employee(
                        db, emp.id, emp.contract_start, emp.additional_vacation_days or 0
                    )
                    print(f"[IMPORT]   OK Created periods for {emp.name}")
                except Exception as e:
                    print(f"[IMPORT]   ERROR creating periods for {emp.name}: {e}")
        
        await db.commit()
        print(f"[IMPORT] Vacation periods creation completed")

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "total": created + updated,
    }