from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.repositories.vacation_plan_repository import VacationPlanRepository
from app.schemas.vacation_plan import VacationPlanResponse, VacationPlanSummary


class VacationPlanService:
    def __init__(self):
        self._repo = VacationPlanRepository()

    async def create_or_update(
        self, db: AsyncSession, data: dict
    ) -> VacationPlanResponse:
        plan = await self._repo.create_or_update(db, data)
        if not plan:
            return None
        return VacationPlanResponse.model_validate(plan)

    async def get_by_year(self, db: AsyncSession, year: int) -> list[VacationPlanResponse]:
        plans = await self._repo.get_by_year(db, year)
        return [VacationPlanResponse.model_validate(p) for p in plans]

    async def get_summary(self, db: AsyncSession, year: int) -> list[VacationPlanSummary]:
        """Сводка по всем сотрудникам за год."""
        plans = await self._repo.get_by_year(db, year)

        # Группируем по сотруднику
        grouped: dict[int, dict] = {}
        for p in plans:
            if p.employee_id not in grouped:
                grouped[p.employee_id] = {"employee_id": p.employee_id, "months": {}, "total_plan_count": 0.0}
            # Не добавляем пустые значения в months
            plan_count_str = p.plan_count.strip() if p.plan_count else ""
            if plan_count_str:
                grouped[p.employee_id]["months"][p.month] = p.plan_count
                # Парсим план_каунт для суммирования
                plan_value = self._parse_plan_count(p.plan_count)
                grouped[p.employee_id]["total_plan_count"] += plan_value

        # Получаем имена сотрудников
        if grouped:
            emp_ids = list(grouped.keys())
            result = await db.execute(
                select(Employee).where(Employee.id.in_(emp_ids))
            )
            employees = {e.id: e for e in result.scalars().all()}
        else:
            employees = {}

        summaries = []
        for emp_id, data in grouped.items():
            emp = employees.get(emp_id)
            if not emp:
                continue
            summary = VacationPlanSummary(
                employee_id=emp_id,
                employee_name=emp.name,
                department_id=emp.department_id,
                months=data["months"],
                total_plan_count=str(data["total_plan_count"]),
            )
            summaries.append(summary)

        return summaries

    def _parse_plan_count(self, plan_count: str) -> float:
        """Парсит план_каунт в число для суммирования."""
        plan_count = plan_count.strip()
        if not plan_count:
            return 0.0
        if '/' in plan_count:
            parts = plan_count.split('/')
            return float(parts[0]) / float(parts[1])
        return float(plan_count)

    async def delete(self, db: AsyncSession, plan_id: int) -> bool:
        result = await self._repo.delete(db, plan_id)
        if not result:
            raise HTTPException(status_code=404, detail="Запись плана не найдена")
        return True


vacation_plan_service = VacationPlanService()
