import os
from datetime import datetime
from typing import Optional
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.core.paths import storage_path, to_relative
from app.models.employee import Employee
from app.models.document import Document
from app.schemas.vacation_plan import VacationPlanResponse, VacationPlanCreate, VacationPlanUpdate, VacationPlanSummary
from app.services.vacation_plan_service import vacation_plan_service

router = APIRouter(prefix="/vacation-plans", tags=["vacation-plans"])


VACATION_CALENDAR_DOC_CODE = "vacation_calendar"


def _vacation_calendar_dir() -> Path:
    base = Path(settings.STAFFING_PATH)
    path = base / VACATION_CALENDAR_DOC_CODE
    path.mkdir(parents=True, exist_ok=True)
    return path


def _resolve_vacation_calendar_path(relative_path: str) -> Path:
    """Convert relative path stored in DB to absolute path on disk.

    Supports both legacy keys (filename only) and new keys
    ('vacation_calendar/filename').
    """
    key = str(relative_path).strip().replace("\\", "/")
    if not key.startswith("vacation_calendar/"):
        key = f"vacation_calendar/{key.lstrip('/')}"
    return storage_path(key, "STAFFING_PATH")


def _make_vacation_calendar_relative(absolute_path: Path) -> str:
    """Convert absolute path to relative path for DB storage.

    Stores portable key relative to STAFFING_PATH, for example
    'vacation_calendar/filename.xlsx'.
    """
    return to_relative(absolute_path, "STAFFING_PATH")


VacationPlanResponseOrNone = Optional[VacationPlanResponse]


def _get_current_user_stub() -> str:
    return "admin"


@router.get("", response_model=list[VacationPlanResponse])
async def list_vacation_plans(
    year: Optional[int] = Query(None),
    employee_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    if year:
        if employee_id:
            plans = await vacation_plan_service._repo.get_by_employee_and_year(db, employee_id, year)
            return [VacationPlanResponse.model_validate(p) for p in plans]
        return await vacation_plan_service.get_by_year(db, year)
    return []


@router.get("/summary", response_model=list[VacationPlanSummary])
async def get_vacation_plans_summary(
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_plan_service.get_summary(db, year)


@router.post("", response_model=VacationPlanResponseOrNone, status_code=200)
async def create_or_update_vacation_plan(
    data: VacationPlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    return await vacation_plan_service.create_or_update(db, data.model_dump())


@router.put("/{plan_id}", response_model=VacationPlanResponse)
async def update_vacation_plan(
    plan_id: int,
    data: VacationPlanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    plan = await vacation_plan_service._repo.get_by_id(db, plan_id)
    if not plan:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Запись плана не найдена")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(plan, key, value)
    await db.flush()
    await db.refresh(plan)
    return VacationPlanResponse.model_validate(plan)


@router.delete("/{plan_id}", status_code=204)
async def delete_vacation_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    await vacation_plan_service.delete(db, plan_id)


@router.get("/calendar/current")
async def get_current_vacation_calendar(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Get the current uploaded vacation calendar file info."""
    result = await db.execute(
        select(Document)
        .where(Document.doc_code == VACATION_CALENDAR_DOC_CODE, Document.is_current == True)
        .order_by(Document.uploaded_at.desc())
        .limit(1)
    )
    doc = result.scalar_one_or_none()
    return {
        "document": {
            "id": doc.id,
            "original_filename": doc.original_filename,
            "file_type": doc.file_type,
            "uploaded_at": doc.uploaded_at,
            "uploaded_by": doc.uploaded_by,
        } if doc else None
    }


@router.get("/calendar/{doc_id}/download")
async def download_vacation_calendar(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Download a specific vacation calendar file."""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.doc_code == VACATION_CALENDAR_DOC_CODE)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Файл графика не найден")

    file_path = _resolve_vacation_calendar_path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл отсутствует на диске")

    return FileResponse(
        str(file_path),
        filename=doc.original_filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/calendar/{doc_id}/onlyoffice/config")
async def vacation_calendar_onlyoffice_config(
    doc_id: int,
    request: Request,
    mode: str = Query("view", pattern="^(edit|view)$"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Get OnlyOffice config for viewing a vacation calendar file."""
    from app.services.onlyoffice_service import onlyoffice_service
    from urllib.parse import urlparse

    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.doc_code == VACATION_CALENDAR_DOC_CODE)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Файл графика не найден")

    file_path = _resolve_vacation_calendar_path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл отсутствует на диске")

    # Build public API URL
    base_url = (settings.BACKEND_INTERNAL_CALLBACK_URL or settings.APP_PUBLIC_URL).rstrip("/")
    file_url = f"{base_url}/api/vacation-plans/calendar/{doc_id}/download"
    callback_url = f"{base_url}/api/vacation-plans/calendar/{doc_id}/onlyoffice/callback"

    config = onlyoffice_service.build_config(
        doc_type=VACATION_CALENDAR_DOC_CODE,
        doc_id=doc_id,
        file_path=file_path,
        title=doc.original_filename,
        callback_url=callback_url,
        file_url=file_url,
        mode=mode,
    )

    # Determine document server URL
    configured = settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
    config["documentServerUrl"] = configured
    return config


@router.get("/calendar/{doc_id}/onlyoffice/callback")
async def vacation_calendar_onlyoffice_callback(
    doc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """OnlyOffice callback for vacation calendar files."""
    return {"error": 0}


@router.get("/calendar")
async def list_vacation_calendars(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """List all uploaded vacation calendar files."""
    result = await db.execute(
        select(Document)
        .where(Document.doc_code == VACATION_CALENDAR_DOC_CODE)
        .order_by(Document.uploaded_at.desc())
    )
    docs = result.scalars().all()
    return [
        {
            "id": doc.id,
            "original_filename": doc.original_filename,
            "file_type": doc.file_type,
            "uploaded_at": doc.uploaded_at,
            "uploaded_by": doc.uploaded_by,
            "is_current": doc.is_current,
        }
        for doc in docs
    ]


@router.delete("/calendar/{doc_id}", status_code=204)
async def delete_vacation_calendar(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Delete a vacation calendar file."""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.doc_code == VACATION_CALENDAR_DOC_CODE)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Файл графика не найден")

    # Delete file from disk
    file_path = _resolve_vacation_calendar_path(doc.file_path)
    if file_path.exists():
        file_path.unlink()

    await db.delete(doc)
    await db.commit()


@router.get("/import/template")
async def download_vacation_plan_template():
    """Скачать шаблон Excel для импорта графика отпусков."""
    api_dir = os.path.dirname(__file__)
    app_dir = os.path.dirname(api_dir)
    template_path = os.path.join(app_dir, "template_vacation_plans.xlsx")

    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail="Шаблон не найден. Обратитесь к администратору.")

    return FileResponse(
        path=template_path,
        filename="Шаблон_график_отпусков.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/import")
async def import_vacation_plans(
    file: UploadFile = File(...),
    year: int = Query(...),
    sheet_index: int = Query(0, ge=0),
    preview_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(_get_current_user_stub),
):
    """Импортирует график отпусков из Excel файла. Если preview_only=True — только парсит и возвращает preview без записи в БД."""
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Только .xlsx файлы поддерживаются")

    try:
        from python_calamine import CalamineWorkbook
    except ImportError:
        raise HTTPException(status_code=500, detail="python-calamine не установлен")

    content = await file.read()
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
        raise HTTPException(status_code=400, detail="Файл пуст или не содержит данных")

    # Автоопределение заголовков
    MONTH_NAMES = {
        "январь": 1, "февраль": 2, "март": 3, "апрель": 4,
        "май": 5, "июнь": 6, "июль": 7, "август": 8,
        "сентябрь": 9, "октябрь": 10, "ноябрь": 11, "декабрь": 12,
    }

    header_row_idx = None
    name_col_idx = None
    month_col_map: dict[int, int] = {}

    for row_idx, row in enumerate(data, 0):
        for col_idx, cell in enumerate(row):
            if cell and isinstance(cell, str):
                val = cell.strip().lower()
                if "фио" in val:
                    header_row_idx = row_idx
                    name_col_idx = col_idx
                for m_name, m_num in MONTH_NAMES.items():
                    if m_name in val:
                        month_col_map[m_num] = col_idx
        if header_row_idx is not None:
            break

    if header_row_idx is None:
        raise HTTPException(status_code=400, detail="Не удалось найти колонку ФИО в файле")
    if not month_col_map:
        raise HTTPException(status_code=400, detail="Не удалось найти колонки с месяцами в файле")

    # Загружаем всех сотрудников для сопоставления
    result = await db.execute(select(Employee).where(Employee.is_deleted == False))
    employees = result.scalars().all()
    emp_by_name: dict[str, Employee] = {}
    for emp in employees:
        normalized = " ".join(emp.name.split()).strip().lower()
        emp_by_name[normalized] = emp

    # Загружаем существующие планы за год чтобы определить created vs updated
    existing_plans = await vacation_plan_service._repo.get_by_year(db, year)
    employees_with_plans = {p.employee_id for p in existing_plans}

    created = 0
    updated = 0
    not_found: list[dict] = []
    skipped_empty: list[str] = []
    processed: list[dict] = []

    MONTH_NAMES_RU = {
        1: "Янв", 2: "Фев", 3: "Мар", 4: "Апр", 5: "Май", 6: "Июн",
        7: "Июл", 8: "Авг", 9: "Сен", 10: "Окт", 11: "Ноя", 12: "Дек",
    }

    for row in data[header_row_idx + 1:]:
        name_val = row[name_col_idx] if name_col_idx < len(row) else None
        if not name_val:
            continue
        name_str = str(name_val).strip()
        normalized_name = " ".join(name_str.split()).lower()

        # Должность (обычно в колонке C, индекс 2)
        position_val = row[2] if 2 < len(row) else None
        position_str = str(position_val).strip() if position_val else ""

        # Собираем месяцы для этой строки
        row_months: dict[str, str] = {}
        for month_num, col_idx in month_col_map.items():
            if col_idx >= len(row):
                continue
            val = row[col_idx]
            if val is None:
                continue

            # Форматируем значение: float -> красивая строка
            if isinstance(val, float):
                if abs(val - round(val)) < 1e-9:
                    plan_count = str(int(round(val)))
                elif abs(val - 0.3333333333333333) < 1e-6:
                    plan_count = "1/3"
                elif abs(val - 0.6666666666666666) < 1e-6:
                    plan_count = "2/3"
                elif abs(val - 0.5) < 1e-9:
                    plan_count = "0.5"
                else:
                    plan_count = ("{:.10f}".format(val)).rstrip("0").rstrip(".")
            else:
                plan_count = str(val).strip()

            if not plan_count:
                continue

            row_months[MONTH_NAMES_RU[month_num]] = plan_count

        emp = emp_by_name.get(normalized_name)

        if not emp:
            # Не найден в БД
            if row_months:
                not_found.append({
                    "name": name_str,
                    "position": position_str,
                    "months": row_months,
                })
            else:
                skipped_empty.append(name_str)
            continue

        # Если сотрудник найден, но у него нет данных по месяцам — пропускаем
        if not row_months:
            continue

        # Определяем создано/обновлено на уровне сотрудника (есть ли у него уже планы за этот год)
        is_update = emp.id in employees_with_plans
        if is_update:
            updated += len(row_months)
        else:
            created += len(row_months)

        # Записываем в БД (если не preview)
        if not preview_only:
            # Сначала удаляем ВСЕ старые планы этого сотрудника за год — полная перезапись
            await vacation_plan_service._repo.delete_by_employee_and_year(db, emp.id, year)

            for month_num, col_idx in month_col_map.items():
                if col_idx >= len(row):
                    continue
                val = row[col_idx]
                if val is None:
                    continue

                if isinstance(val, float):
                    if abs(val - round(val)) < 1e-9:
                        plan_count = str(int(round(val)))
                    elif abs(val - 0.3333333333333333) < 1e-6:
                        plan_count = "1/3"
                    elif abs(val - 0.6666666666666666) < 1e-6:
                        plan_count = "2/3"
                    elif abs(val - 0.5) < 1e-9:
                        plan_count = "0.5"
                    else:
                        plan_count = ("{:.10f}".format(val)).rstrip("0").rstrip(".")
                else:
                    plan_count = str(val).strip()

                if not plan_count:
                    continue

                plan_data = {
                    "employee_id": emp.id,
                    "year": year,
                    "month": month_num,
                    "plan_count": plan_count,
                }
                await vacation_plan_service._repo.create_or_update(db, plan_data)

        processed.append({
            "name": name_str,
            "position": position_str,
            "months": row_months,
            "is_update": is_update,
        })

    if not preview_only:
        await db.commit()

        # Save the uploaded file as a document (reuse content read at the top)
        vc_dir = _vacation_calendar_dir()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = Path(file.filename).stem.replace(" ", "_") if file.filename else "vacation_calendar"
        storage_filename = f"{timestamp}_{safe_name}_{year}.xlsx"
        file_path = vc_dir / storage_filename
        file_path.write_bytes(content)

        # Mark previous documents as non-current
        await db.execute(
            Document.__table__.update()
            .where(Document.doc_code == VACATION_CALENDAR_DOC_CODE, Document.is_current == True)
            .values(is_current=False)
        )

        doc = Document(
            doc_code=VACATION_CALENDAR_DOC_CODE,
            file_path=_make_vacation_calendar_relative(file_path),
            original_filename=file.filename or storage_filename,
            file_type="xlsx",
            uploaded_by=current_user,
            is_current=True,
        )
        db.add(doc)
        await db.commit()

    return {
        "created": created,
        "updated": updated,
        "not_found": not_found,
        "skipped_empty": skipped_empty,
        "total_processed": created + updated,
        "processed": processed,
        "preview_only": preview_only,
    }
