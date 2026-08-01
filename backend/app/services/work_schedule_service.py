from datetime import date, datetime, timezone
from typing import List, Optional, Dict, Any, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.work_schedule_repository import work_schedule_repository
from app.models.work_schedule import WorkSchedule, WorkScheduleEntry
from app.core.shift_types import validate_shift_type_code


class WorkScheduleNotFoundError(Exception):
    pass


class WorkScheduleAlreadyExistsError(Exception):
    pass


class WorkScheduleService:
    """Сервис планового графика работы сотрудника."""

    def __init__(self) -> None:
        self.repo = work_schedule_repository

    async def get_schedule(
        self, db: AsyncSession, schedule_id: int, with_entries: bool = True
    ) -> Optional[WorkSchedule]:
        return await self.repo.get_by_id(db, schedule_id, with_entries=with_entries)

    async def get_schedule_by_employee_period(
        self,
        db: AsyncSession,
        employee_id: int,
        year: int,
        month: int,
        with_entries: bool = True,
    ) -> Optional[WorkSchedule]:
        return await self.repo.get_by_employee_period(
            db, employee_id, year, month, with_entries=with_entries
        )

    async def list_by_period(
        self, db: AsyncSession, year: int, month: int, with_entries: bool = False
    ) -> List[WorkSchedule]:
        return await self.repo.get_by_period(db, year, month, with_entries=with_entries)

    async def list_by_employee_year(
        self, db: AsyncSession, employee_id: int, year: int, with_entries: bool = False
    ) -> List[WorkSchedule]:
        return await self.repo.get_by_employee_year(
            db, employee_id, year, with_entries=with_entries
        )

    async def create_schedule(
        self,
        db: AsyncSession,
        employee_id: int,
        year: int,
        month: int,
        current_user: str,
        comment: Optional[str] = None,
    ) -> WorkSchedule:
        existing = await self.repo.get_by_employee_period(db, employee_id, year, month)
        if existing:
            raise WorkScheduleAlreadyExistsError(
                f"График для сотрудника на {year}-{month:02d} уже существует (#{existing.id})"
            )
        schedule = await self.repo.create(
            db,
            {
                "employee_id": employee_id,
                "year": year,
                "month": month,
                "comment": comment,
                "created_at": date.today(),
                "created_by": current_user,
            },
        )
        return schedule

    async def update_schedule(
        self, db: AsyncSession, schedule_id: int, data: dict
    ) -> WorkSchedule:
        schedule = await self.repo.get_by_id(db, schedule_id)
        if not schedule:
            raise WorkScheduleNotFoundError(f"График #{schedule_id} не найден")
        return await self.repo.update(db, schedule, data)

    async def approve_schedule(
        self, db: AsyncSession, schedule_id: int, current_user: str
    ) -> WorkSchedule:
        schedule = await self.repo.get_by_id(db, schedule_id)
        if not schedule:
            raise WorkScheduleNotFoundError(f"График #{schedule_id} не найден")
        schedule.is_approved = True
        schedule.approved_by = current_user
        schedule.approved_at = date.today()
        await db.flush()
        await db.refresh(schedule)
        return schedule

    async def unapprove_schedule(self, db: AsyncSession, schedule_id: int) -> WorkSchedule:
        schedule = await self.repo.get_by_id(db, schedule_id)
        if not schedule:
            raise WorkScheduleNotFoundError(f"График #{schedule_id} не найден")
        schedule.is_approved = False
        schedule.approved_by = None
        schedule.approved_at = None
        await db.flush()
        await db.refresh(schedule)
        return schedule

    async def delete_schedule(self, db: AsyncSession, schedule_id: int) -> None:
        schedule = await self.repo.get_by_id(db, schedule_id)
        if not schedule:
            raise WorkScheduleNotFoundError(f"График #{schedule_id} не найден")
        if schedule.is_approved:
            raise PermissionError("Невозможно удалить утверждённый график")
        await self.repo.delete(db, schedule)

    # --- Entries ---

    async def set_entry(
        self,
        db: AsyncSession,
        schedule_id: int,
        work_date: date,
        shift_type_code: Optional[str],
        planned_hours_override: Optional[float] = None,
        note: Optional[str] = None,
    ) -> WorkScheduleEntry:
        code = validate_shift_type_code(shift_type_code)
        schedule = await self.repo.get_by_id(db, schedule_id)
        if not schedule:
            raise WorkScheduleNotFoundError(f"График #{schedule_id} не найден")
        now = datetime.now(timezone.utc)
        existing = await self.repo.get_entry_by_date(db, schedule_id, work_date)
        if existing:
            existing.shift_type_code = code
            existing.planned_hours_override = planned_hours_override
            existing.note = note
            existing.updated_at = now
            await db.flush()
            await db.refresh(existing)
            return existing
        return await self.repo.add_entry(
            db,
            schedule_id,
            {
                "work_date": work_date,
                "shift_type_code": code,
                "planned_hours_override": planned_hours_override,
                "note": note,
                "updated_at": now,
            },
        )

    async def bulk_set_entries(
        self,
        db: AsyncSession,
        schedule_id: int,
        entries: List[Dict[str, Any]],
    ) -> List[WorkScheduleEntry]:
        schedule = await self.repo.get_by_id(db, schedule_id)
        if not schedule:
            raise WorkScheduleNotFoundError(f"График #{schedule_id} не найден")
        # Валидируем все коды смен до записи
        now = datetime.now(timezone.utc)
        normalized = []
        for entry in entries:
            data = dict(entry)
            data["shift_type_code"] = validate_shift_type_code(data.get("shift_type_code"))
            data["updated_at"] = now
            normalized.append(data)

        # Удаляем старые записи, добавляем новые (утверждение не блокирует правку)
        await self.repo.replace_entries(db, schedule_id, normalized)
        # Возвращаем обновлённый список
        refreshed = await self.repo.get_by_id(db, schedule_id, with_entries=True)
        return refreshed.entries if refreshed else []

    async def partial_bulk_set(
        self,
        db: AsyncSession,
        entries: List[Dict[str, Any]],
        current_user: str,
    ) -> Dict[str, Any]:
        """Массовая установка записей по разным сотрудникам и месяцам.

        Группирует записи по (employee_id, год, месяц), для каждой группы
        находит или создаёт график, затем применяет каждую запись. Выделение,
        пересекающее границу месяца, попадает в оба графика (ключ группы —
        из даты записи). Ошибка отдельной записи не откатывает уже успешные
        (частичный отказ): каждая запись применяется в своём savepoint.
        Возвращает построчный результат.
        """
        results: List[Dict[str, Any]] = []

        # Группируем по (employee_id, год, месяц)
        groups: Dict[Tuple[int, int, int], List[Dict[str, Any]]] = {}
        for entry in entries:
            work_date: date = entry["work_date"]
            key = (entry["employee_id"], work_date.year, work_date.month)
            groups.setdefault(key, []).append(entry)

        for (employee_id, year, month), group in groups.items():
            # Находим или создаём график на месяц
            schedule = await self.repo.get_by_employee_period(db, employee_id, year, month)
            if schedule is None:
                try:
                    async with db.begin_nested():
                        schedule = await self.repo.create(
                            db,
                            {
                                "employee_id": employee_id,
                                "year": year,
                                "month": month,
                                "created_at": date.today(),
                                "created_by": current_user,
                            },
                        )
                except Exception as exc:  # noqa: BLE001 — частичный отказ не роняет запрос
                    for entry in group:
                        results.append(
                            {
                                "employee_id": employee_id,
                                "work_date": entry["work_date"],
                                "success": False,
                                "error": f"Не удалось создать график: {exc}",
                            }
                        )
                    continue

            for entry in group:
                try:
                    async with db.begin_nested():
                        await self.set_entry(
                            db,
                            schedule.id,
                            entry["work_date"],
                            entry.get("shift_type_code"),
                            entry.get("planned_hours_override"),
                        )
                    results.append(
                        {
                            "employee_id": employee_id,
                            "work_date": entry["work_date"],
                            "success": True,
                            "error": None,
                        }
                    )
                except Exception as exc:  # noqa: BLE001 — частичный отказ не роняет запрос
                    results.append(
                        {
                            "employee_id": employee_id,
                            "work_date": entry["work_date"],
                            "success": False,
                            "error": str(exc),
                        }
                    )

        success_count = sum(1 for r in results if r["success"])
        return {
            "results": results,
            "success_count": success_count,
            "error_count": len(results) - success_count,
        }

    async def delete_entry(self, db: AsyncSession, entry_id: int) -> None:
        entry = await self.repo.get_entry_by_id(db, entry_id)
        if not entry:
            raise WorkScheduleNotFoundError(f"Запись графика #{entry_id} не найдена")
        await self.repo.delete_entry(db, entry)


work_schedule_service = WorkScheduleService()
