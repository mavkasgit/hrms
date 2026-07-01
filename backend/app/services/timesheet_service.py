from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.logging import get_audit_logger
from app.models.employee import Employee
from app.models.timesheet import TimesheetImport, TimesheetEntry, TimesheetUnmatchedRow
from app.models.vacation import Vacation
from app.models.sick_leave import SickLeave, SickLeaveStatus
from app.models.work_schedule import WorkSchedule
from app.repositories.timesheet_repository import (
    timesheet_import_repository,
    timesheet_entry_repository,
    timesheet_unmatched_repository,
)
from app.services.timesheet_parser import (
    ParsedEmployee,
    ParsedFile,
    parse_workedjournal,
    _normalize_employee_name,
    _parse_hours,
)

audit_logger = get_audit_logger()
logger = audit_logger


class TimesheetImportNotFoundError(Exception):
    pass


def _normalize_emp_name_for_lookup(name: str) -> str:
    return _normalize_employee_name(name)


def _entry_to_fact_dict(entry: TimesheetEntry) -> Dict[str, Any]:
    return {
        "presence_hours": entry.presence_hours,
        "work_hours": entry.work_hours,
        "absence_hours": entry.absence_hours,
        "debt_hours": entry.debt_hours,
        "night_hours": entry.night_hours,
        "overtime_hours": entry.overtime_hours,
        "schedule_name": entry.schedule_name,
    }


class TimesheetImportService:
    """Сервис импорта турникетного журнала и работы с табелем."""

    def __init__(self) -> None:
        self.import_repo = timesheet_import_repository
        self.entry_repo = timesheet_entry_repository
        self.unmatched_repo = timesheet_unmatched_repository

    async def _match_employees(
        self, db: AsyncSession, parsed: ParsedFile
    ) -> Tuple[Dict[int, Employee], List[Tuple[ParsedEmployee, str]]]:
        """Сопоставляет распознанных сотрудников с записями в БД.

        Возвращает кортеж:
          - {idx в parsed.employees: Employee} — успешно сопоставленные
          - [(ParsedEmployee, reason), ...] — несопоставленные с указанием причины
        """
        result = await db.execute(
            select(Employee).where(Employee.is_deleted == False)
        )
        employees = list(result.scalars().all())

        by_name: Dict[str, List[Employee]] = {}
        by_tab: Dict[str, List[Employee]] = {}
        for e in employees:
            if e.name:
                key = _normalize_emp_name_for_lookup(e.name)
                by_name.setdefault(key, []).append(e)
            if e.tab_number is not None:
                by_tab.setdefault(str(e.tab_number), []).append(e)

        matched: Dict[int, Employee] = {}
        unmatched: List[Tuple[ParsedEmployee, str]] = []

        for idx, emp in enumerate(parsed.employees):
            full_name_parts = [emp.last_name or "", emp.first_name or "", emp.patronymic or ""]
            full_name = " ".join(p for p in full_name_parts if p).strip()
            key = _normalize_emp_name_for_lookup(full_name)

            if key and key in by_name and len(by_name[key]) == 1:
                matched[idx] = by_name[key][0]
                continue

            if emp.tab_number:
                tab_key = emp.tab_number.strip()
                if tab_key in by_tab and len(by_tab[tab_key]) == 1:
                    matched[idx] = by_tab[tab_key][0]
                    continue

            reason = "not_found"
            if key and key in by_name and len(by_name[key]) > 1:
                reason = "ambiguous_name"
            elif emp.tab_number and emp.tab_number in by_tab and len(by_tab[emp.tab_number]) > 1:
                reason = "ambiguous_tab"
            unmatched.append((emp, reason))

        return matched, unmatched

    def _make_unmatched_key(self, emp: ParsedEmployee) -> str:
        return "|".join(
            [
                emp.last_name or "",
                emp.first_name or "",
                emp.patronymic or "",
                emp.tab_number or "",
            ]
        )

    def normalize_imported_hours(self, val: Optional[float], night_hours: Optional[float] = None) -> Optional[float]:
        if val is None:
            return None
        if night_hours and night_hours > 0.0:
            if night_hours > 6.0:
                if val >= 10.0:
                    return 12.0
                else:
                    return 8.0
            else:
                if val >= 10.0:
                    return 12.0
                elif val >= 6.0:
                    return 8.0
                else:
                    return 4.0
        if val >= 10.0:
            return 12.0
        elif val >= 6.0:
            return 8.0
        elif val > 0.0:
            return float(round(val))
        return 0.0

    def _build_day_preview(self, day) -> Dict[str, Any]:
        """Собирает словарь одного дня для превью: нормализованные часы + сырые строки."""
        result: Dict[str, Any] = {
            "presence_hours": self.normalize_imported_hours(day.presence_hours, day.night_hours),
            "work_hours": self.normalize_imported_hours(day.work_hours, day.night_hours),
            "absence_hours": day.absence_hours,
            "night_hours": self.normalize_imported_hours(day.night_hours, day.night_hours),
        }
        if day.raw is not None:
            result["raw"] = {
                "presence": day.raw.presence,
                "work": day.raw.work,
                "absence": day.raw.absence,
                "debt": day.raw.debt,
                "night": day.raw.night,
                "overtime": day.raw.overtime,
            }
        return result

    async def preview_import(
        self, db: AsyncSession, content: bytes, file_name: str
    ) -> Dict[str, Any]:
        parsed = parse_workedjournal(content)
        matched, unmatched = await self._match_employees(db, parsed)

        return {
            "file_name": file_name,
            "department_name": parsed.department_name,
            "period_start": parsed.period_start.isoformat() if parsed.period_start else None,
            "period_end": parsed.period_end.isoformat() if parsed.period_end else None,
            "employees_total": len(parsed.employees),
            "employees_matched": len(matched),
            "employees_unmatched": len(unmatched),
            "matched_preview": [
                {
                    "parsed_index": idx,
                    "employee_id": emp.id,
                    "employee_name": emp.name,
                    "tab_number": emp.tab_number,
                    "days_count": len(parsed.employees[idx].days),
                    "days": {
                        d.isoformat(): self._build_day_preview(day)
                        for d, day in parsed.employees[idx].days.items()
                    }
                }
                for idx, emp in matched.items()
            ],
            "unmatched": [
                {
                    "key": self._make_unmatched_key(emp),
                    "last_name": emp.last_name,
                    "first_name": emp.first_name,
                    "patronymic": emp.patronymic,
                    "tab_number": emp.tab_number,
                    "department_name": emp.department_name,
                    "position_name": emp.position_name,
                    "schedule_name": emp.schedule_name,
                    "days_count": len(emp.days),
                    "total_presence": emp.total_presence,
                    "reason": reason,
                    "days": {
                        d.isoformat(): self._build_day_preview(day)
                        for d, day in emp.days.items()
                    }
                }
                for emp, reason in unmatched
            ],
        }

    async def confirm_import(
        self,
        db: AsyncSession,
        content: bytes,
        file_name: str,
        current_user: str,
        unmatched_assignments: Optional[Dict[str, int]] = None,
    ) -> TimesheetImport:
        parsed = parse_workedjournal(content)
        matched, unmatched = await self._match_employees(db, parsed)

        manual_matches: Dict[int, Employee] = {}
        unmatched_assignments = unmatched_assignments or {}
        if unmatched_assignments:
            emp_ids = list(set(unmatched_assignments.values()))
            if emp_ids:
                emp_result = await db.execute(
                    select(Employee).where(Employee.id.in_(emp_ids))
                )
                emp_by_id = {e.id: e for e in emp_result.scalars().all()}

            for idx, (emp, _reason) in enumerate(unmatched):
                key = self._make_unmatched_key(emp)
                if key in unmatched_assignments:
                    target_id = unmatched_assignments[key]
                    if target_id in emp_by_id:
                        manual_matches[idx] = emp_by_id[target_id]

        final_matched = dict(matched)
        final_matched.update(manual_matches)

        # Сохраняем файл на диск
        stored_path = None
        try:
            documents_dir = Path(settings.STAFFING_PATH) / "timesheet_imports"
            documents_dir.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_name = Path(file_name).stem.replace(" ", "_")[:50] if file_name else "import"
            storage_filename = f"{timestamp}_{safe_name}.xlsx"
            file_path = documents_dir / storage_filename
            file_path.write_bytes(content)
            stored_path = file_path.relative_to(Path(settings.STAFFING_PATH)).as_posix()
        except Exception as e:
            logger.warning(f"Не удалось сохранить файл импорта на диск: {e}")

        period_start = parsed.period_start or date.today().replace(day=1)
        period_end = parsed.period_end or period_start

        import_record = await self.import_repo.create(
            db,
            {
                "file_name": file_name,
                "period_start": period_start,
                "period_end": period_end,
                "department_name": parsed.department_name,
                "employees_total": len(parsed.employees),
                "employees_matched": len(final_matched),
                "employees_unmatched": len(parsed.employees) - len(final_matched),
                "entries_imported": 0,
                "stored_path": stored_path,
                "status": "completed",
                "uploaded_by": current_user,
            },
        )

        entries_to_create: List[dict] = []
        for idx, employee in final_matched.items():
            parsed_emp = parsed.employees[idx]
            for work_date, day in parsed_emp.days.items():
                entries_to_create.append(
                    {
                        "import_id": import_record.id,
                        "employee_id": employee.id,
                        "work_date": work_date,
                        "presence_hours": self.normalize_imported_hours(
                            day.presence_hours,
                            day.night_hours
                        ),
                        "work_hours": self.normalize_imported_hours(
                            day.work_hours,
                            day.night_hours
                        ),
                        "absence_hours": day.absence_hours,
                        "debt_hours": day.debt_hours,
                        "night_hours": self.normalize_imported_hours(
                            day.night_hours,
                            day.night_hours
                        ),
                        "overtime_hours": day.overtime_hours,
                        "department_name": parsed_emp.department_name,
                        "position_name": parsed_emp.position_name,
                        "schedule_name": parsed_emp.schedule_name,
                        "raw_last_name": parsed_emp.last_name,
                        "raw_first_name": parsed_emp.first_name,
                        "raw_patronymic": parsed_emp.patronymic,
                        "raw_tab_number": parsed_emp.tab_number,
                    }
                )

        if entries_to_create:
            await self.entry_repo.bulk_create(db, entries_to_create)

        rows_to_create: List[dict] = []
        for emp, reason in unmatched:
            key = self._make_unmatched_key(emp)
            matched_emp_id = unmatched_assignments.get(key) if unmatched_assignments else None
            rows_to_create.append(
                {
                    "import_id": import_record.id,
                    "last_name": emp.last_name,
                    "first_name": emp.first_name,
                    "patronymic": emp.patronymic,
                    "tab_number": emp.tab_number,
                    "department_name": emp.department_name,
                    "position_name": emp.position_name,
                    "schedule_name": emp.schedule_name,
                    "total_hours": _parse_hours(emp.total_presence),
                    "notes": f"Причина: {reason}",
                    "matched_employee_id": matched_emp_id,
                }
            )
        if rows_to_create:
            await self.unmatched_repo.bulk_create(db, rows_to_create)

        await self.import_repo.update(
            db, import_record, {"entries_imported": len(entries_to_create)}
        )

        await db.commit()
        await db.refresh(import_record)

        audit_logger.info(
            "TIMESHEET IMPORT",
            extra={
                "action": "timesheet_import",
                "user_id": current_user,
                "details": {
                    "file": file_name,
                    "import_id": import_record.id,
                    "period": f"{period_start} - {period_end}",
                    "employees_matched": len(final_matched),
                    "employees_unmatched": len(unmatched),
                    "entries_imported": len(entries_to_create),
                },
            },
        )

        return import_record

    async def list_imports(
        self,
        db: AsyncSession,
        limit: int = 50,
        offset: int = 0,
        period_start: Optional[date] = None,
        period_end: Optional[date] = None,
    ) -> Tuple[List[TimesheetImport], int]:
        return await self.import_repo.get_all(
            db,
            limit=limit,
            offset=offset,
            period_start=period_start,
            period_end=period_end,
        )

    async def get_import(
        self, db: AsyncSession, import_id: int, with_entries: bool = False
    ) -> TimesheetImport:
        record = await self.import_repo.get_by_id(db, import_id, with_entries=with_entries)
        if not record:
            raise TimesheetImportNotFoundError(f"Импорт #{import_id} не найден")
        return record

    async def get_unmatched(
        self, db: AsyncSession, import_id: int
    ) -> List[TimesheetUnmatchedRow]:
        return await self.unmatched_repo.get_by_import(db, import_id)

    async def assign_unmatched(
        self,
        db: AsyncSession,
        import_id: int,
        row_id: int,
        employee_id: int,
        current_user: str,
    ) -> TimesheetUnmatchedRow:
        row = await self.unmatched_repo.get_by_id(db, row_id)
        if not row or row.import_id != import_id:
            raise TimesheetImportNotFoundError("Строка не найдена")

        emp = await db.get(Employee, employee_id)
        if not emp:
            raise ValueError("Сотрудник не найден")

        stmt = select(TimesheetEntry).where(
            and_(
                TimesheetEntry.import_id == import_id,
                TimesheetEntry.employee_id.is_(None),
                TimesheetEntry.raw_last_name == row.last_name,
                TimesheetEntry.raw_first_name == row.first_name,
                TimesheetEntry.raw_patronymic == row.patronymic,
                TimesheetEntry.raw_tab_number == row.tab_number,
            )
        )
        result = await db.execute(stmt)
        entries = list(result.scalars().all())
        for entry in entries:
            entry.employee_id = emp.id
            entry.schedule_name = row.schedule_name or entry.schedule_name
            entry.department_name = row.department_name or entry.department_name
            entry.position_name = row.position_name or entry.position_name
            await db.flush()

        row.matched_employee_id = emp.id
        row.notes = (row.notes or "") + f" | Сопоставлен вручную {current_user}"
        await db.flush()
        await db.refresh(row)

        record = await self.import_repo.get_by_id(db, import_id)
        if record:
            record.employees_matched = (record.employees_matched or 0) + 1
            record.employees_unmatched = max(0, (record.employees_unmatched or 0) - 1)
            await db.flush()
            await db.refresh(record)

        await db.commit()
        return row

    async def rollback_import(
        self,
        db: AsyncSession,
        import_id: int,
        current_user: str,
    ) -> TimesheetImport:
        record = await self.import_repo.get_by_id(db, import_id)
        if not record:
            raise TimesheetImportNotFoundError(f"Импорт #{import_id} не найден")
        if record.rolled_back_at:
            raise ValueError("Импорт уже откатан")
        await self.entry_repo.delete_by_import(db, import_id)
        unmatched_rows = await self.unmatched_repo.get_by_import(db, import_id)
        for r in unmatched_rows:
            await self.unmatched_repo.delete(db, r)
        record.rolled_back_at = datetime.now()
        record.rolled_back_by = current_user
        record.status = "rolled_back"
        await db.flush()
        await db.refresh(record)
        await db.commit()

        audit_logger.info(
            "TIMESHEET IMPORT ROLLBACK",
            extra={
                "action": "timesheet_rollback",
                "user_id": current_user,
                "details": {"import_id": import_id},
            },
        )
        return record

    async def get_timesheet(
        self,
        db: AsyncSession,
        period_start: date,
        period_end: date,
        employee_ids: Optional[List[int]] = None,
        department_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Возвращает данные для построения табеля."""
        emp_stmt = select(Employee).where(
            Employee.is_deleted == False, Employee.is_dismissed == False
        )
        if employee_ids is not None:
            emp_stmt = emp_stmt.where(Employee.id.in_(employee_ids))
        if department_id is not None:
            emp_stmt = emp_stmt.where(Employee.department_id == department_id)
        emp_stmt = emp_stmt.order_by(Employee.name)
        result = await db.execute(emp_stmt)
        employees = list(result.scalars().all())

        # Плановые записи (если период попадает в один месяц)
        plan_entries_by_emp: Dict[int, Dict[date, dict]] = {e.id: {} for e in employees}
        if (
            period_start.year == period_end.year
            and period_start.month == period_end.month
            and employees
        ):
            schedules_result = await db.execute(
                select(WorkSchedule)
                .options(selectinload(WorkSchedule.entries))
                .where(
                    and_(
                        WorkSchedule.year == period_start.year,
                        WorkSchedule.month == period_start.month,
                        WorkSchedule.employee_id.in_([e.id for e in employees]),
                    )
                )
            )
            schedules = list(schedules_result.scalars().all())
            for sched in schedules:
                if sched.employee_id not in plan_entries_by_emp:
                    plan_entries_by_emp[sched.employee_id] = {}
                for entry in sched.entries:
                    if period_start <= entry.work_date <= period_end:
                        plan_entries_by_emp[sched.employee_id][entry.work_date] = {
                            "shift_type_code": entry.shift_type_code,
                            "planned_hours_override": entry.planned_hours_override,
                            "note": entry.note,
                        }

        # Фактические записи
        fact_entries_by_emp: Dict[int, Dict[date, TimesheetEntry]] = {
            e.id: {} for e in employees
        }
        if employees:
            fact_entries = await self.entry_repo.get_by_period(
                db, period_start, period_end, employee_ids=[e.id for e in employees]
            )
            for entry in fact_entries:
                if entry.employee_id is None:
                    continue
                fact_entries_by_emp.setdefault(entry.employee_id, {})[entry.work_date] = entry

        # Отсутствия (отпуск / больничный)
        absences_by_emp: Dict[int, List[Dict[str, Any]]] = {e.id: [] for e in employees}
        if employees:
            emp_ids_list = [e.id for e in employees]
            vacation_result = await db.execute(
                select(Vacation).where(
                    and_(
                        Vacation.employee_id.in_(emp_ids_list),
                        Vacation.start_date <= period_end,
                        Vacation.end_date >= period_start,
                    )
                )
            )
            for v in vacation_result.scalars().all():
                absences_by_emp.setdefault(v.employee_id, []).append(
                    {
                        "id": v.id,
                        "type": "vacation",
                        "start_date": v.start_date.isoformat(),
                        "end_date": v.end_date.isoformat(),
                        "vacation_type": v.vacation_type,
                        "order_id": v.order_id,
                    }
                )

            sick_result = await db.execute(
                select(SickLeave).where(
                    and_(
                        SickLeave.employee_id.in_(emp_ids_list),
                        SickLeave.start_date <= period_end,
                        SickLeave.end_date >= period_start,
                        SickLeave.status == SickLeaveStatus.ACTIVE,
                    )
                )
            )
            for s in sick_result.scalars().all():
                absences_by_emp.setdefault(s.employee_id, []).append(
                    {
                        "id": s.id,
                        "type": "sick_leave",
                        "start_date": s.start_date.isoformat(),
                        "end_date": s.end_date.isoformat(),
                    }
                )

        # Подгружаем теги сотрудников одним запросом
        from app.models.tag import Tag, EmployeeTag
        tags_by_emp: Dict[int, List[Dict[str, Any]]] = {e.id: [] for e in employees}
        if employees:
            tags_result = await db.execute(
                select(EmployeeTag, Tag)
                .join(Tag, EmployeeTag.tag_id == Tag.id)
                .where(EmployeeTag.employee_id.in_([e.id for e in employees]))
                .order_by(Tag.name)
            )
            for et, tag in tags_result.all():
                tags_by_emp.setdefault(et.employee_id, []).append({
                    "id": tag.id,
                    "name": tag.name,
                    "color": tag.color,
                })

        # Подгружаем названия подразделений
        from app.models.department import Department
        dept_names: Dict[int, str] = {}
        if employees:
            dept_ids = list({e.department_id for e in employees if e.department_id is not None})
            if dept_ids:
                dept_result = await db.execute(
                    select(Department).where(Department.id.in_(dept_ids))
                )
                for d in dept_result.scalars().all():
                    dept_names[d.id] = d.name

        # Названия должностей
        from app.models.position import Position
        pos_names: Dict[int, str] = {}
        if employees:
            pos_ids = list({e.position_id for e in employees if e.position_id is not None})
            if pos_ids:
                pos_result = await db.execute(
                    select(Position).where(Position.id.in_(pos_ids))
                )
                for p in pos_result.scalars().all():
                    pos_names[p.id] = p.name

        return {
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "employees": [
                {
                    "id": e.id,
                    "name": e.name,
                    "tab_number": e.tab_number,
                    "department_id": e.department_id,
                    "department_name": dept_names.get(e.department_id) if e.department_id else None,
                    "position_id": e.position_id,
                    "position_name": pos_names.get(e.position_id) if e.position_id else None,
                    "tags": tags_by_emp.get(e.id, []),
                    "plan": {
                        d.isoformat(): v for d, v in plan_entries_by_emp.get(e.id, {}).items()
                    },
                    "fact": {
                        d.isoformat(): _entry_to_fact_dict(en)
                        for d, en in fact_entries_by_emp.get(e.id, {}).items()
                    },
                    "absences": absences_by_emp.get(e.id, []),
                }
                for e in employees
            ],
        }

    async def get_timesheet_grid(
        self,
        db: AsyncSession,
        period_start: date,
        period_end: date,
        department_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Расширенный табель для UI: сотрудники + планы + факты + смены + праздники одним запросом."""
        base = await self.get_timesheet(
            db, period_start, period_end, department_id=department_id
        )
        year = period_start.year

        from app.core.shift_types import SHIFT_TYPE_CATALOG
        from app.models.references import Holiday
        hol_stmt = select(Holiday).where(Holiday.year == year).order_by(Holiday.date)
        hol_result = await db.execute(hol_stmt)
        holidays = list(hol_result.scalars().all())

        base["shift_types"] = [
            {
                "code": st.code,
                "name": st.name,
                "start_time": st.start_time.isoformat() if st.start_time else None,
                "end_time": st.end_time.isoformat() if st.end_time else None,
                "planned_hours": st.planned_hours,
                "is_working": st.is_working,
                "is_night": st.is_night,
                "sort_order": st.sort_order,
            }
            for st in SHIFT_TYPE_CATALOG
        ]
        base["holidays"] = [
            {
                "id": h.id,
                "date": h.date.isoformat(),
                "name": h.name,
                "year": h.year,
                "is_working_day": h.is_working_day,
            }
            for h in holidays
        ]
        return base


timesheet_import_service = TimesheetImportService()
