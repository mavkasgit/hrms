from datetime import date
import pytest
from sqlalchemy import select
from fastapi import HTTPException

from app.models.employee import Employee
from app.models.department import Department
from app.models.position import Position
from app.models.vacation import Vacation
from app.models.vacation_adjustment import VacationAdjustment
from app.models.vacation_period_transaction import VacationPeriodTransaction
from app.services.employee_service import employee_service
from app.services.vacation_service import vacation_service
from app.services.order_service import order_service
from app.api.departments import delete_department
from app.api.positions import delete_position

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _create_paid_vacation(db_session, employee_id: int, start: date, end: date) -> dict:
    return await vacation_service.create_vacation(
        db_session,
        {
            "employee_id": employee_id,
            "start_date": start,
            "end_date": end,
            "vacation_type": "Трудовой",
            "comment": "cleanup-integrity-test",
        },
        "admin",
    )


async def test_delete_department_fails_with_employees_including_deleted(db_session, create_department, create_employee):
    # Создаем департамент и сотрудника в нем
    dept = await create_department()
    emp = await create_employee(department_id=dept.id)
    
    # Мягко удаляем сотрудника
    await employee_service.soft_delete_employee(db_session, emp.id, "admin")
    await db_session.commit()
    
    # Пытаемся удалить департамент напрямую через эндпоинт роутера
    with pytest.raises(HTTPException) as exc_info:
        await delete_department(dept_id=dept.id, db=db_session, current_user="admin")
    
    # Ожидаем 400 Bad Request, а не 500
    assert exc_info.value.status_code == 400
    assert "Cannot delete department with employees" in exc_info.value.detail


async def test_delete_position_fails_with_employees_including_deleted(db_session, create_position, create_employee):
    # Создаем должность и сотрудника с ней
    pos = await create_position()
    emp = await create_employee(position_id=pos.id)
    
    # Мягко удаляем сотрудника
    await employee_service.soft_delete_employee(db_session, emp.id, "admin")
    await db_session.commit()
    
    # Пытаемся удалить должность напрямую через эндпоинт роутера
    with pytest.raises(HTTPException) as exc_info:
        await delete_position(pos_id=pos.id, db=db_session, current_user="admin")
    
    # Ожидаем 400 Bad Request, а не 500
    assert exc_info.value.status_code == 400
    assert "Cannot delete position with employees" in exc_info.value.detail


async def test_hard_delete_employee_with_history_passes(db_session, create_employee):
    employee = await create_employee(hire_date=date(2024, 1, 15))
    created = await _create_paid_vacation(db_session, employee.id, date(2026, 4, 1), date(2026, 4, 11))
    vacation_id = created["id"]
    
    # Делаем отзыв (создает приказ, корректировку и транзакции)
    await vacation_service.recall_vacation(
        db_session,
        vacation_id,
        {
            "recall_date": date(2026, 4, 5),
            "order_date": date(2026, 4, 4),
            "order_number": "R-TEMP-1",
            "comment": "recall for hard delete test",
        },
        "admin",
    )
    await db_session.commit()

    # Убедимся, что транзакции и корректировки существуют
    tx_count = (await db_session.execute(
        select(VacationPeriodTransaction).where(VacationPeriodTransaction.vacation_id == vacation_id)
    )).scalars().all()
    assert len(tx_count) > 0

    adj_count = (await db_session.execute(
        select(VacationAdjustment).where(VacationAdjustment.vacation_id == vacation_id)
    )).scalars().all()
    assert len(adj_count) > 0

    # Жестко удаляем сотрудника. Это должно пройти без IntegrityError!
    success = await employee_service.hard_delete_employee(db_session, employee.id, "admin")
    assert success is True
    
    # Убедимся, что сотрудник и все зависимые записи удалены
    db_session.expire_all()
    emp_db = await db_session.get(Employee, employee.id)
    assert emp_db is None

    vacs = (await db_session.execute(select(Vacation).where(Vacation.employee_id == employee.id))).scalars().all()
    assert len(vacs) == 0

    adjs = (await db_session.execute(select(VacationAdjustment).where(VacationAdjustment.employee_id == employee.id))).scalars().all()
    assert len(adjs) == 0


async def test_delete_vacation_without_order_passes(db_session, create_employee):
    employee = await create_employee(hire_date=date(2024, 1, 15))
    
    # Создаем отпуск напрямую через репозиторий (без приказа)
    from app.repositories.vacation_repository import VacationRepository
    vac_repo = VacationRepository()
    vacation = await vac_repo.create(
        db_session,
        {
            "employee_id": employee.id,
            "start_date": date(2026, 6, 1),
            "end_date": date(2026, 6, 10),
            "vacation_type": "Трудовой",
            "days_count": 10,
            "vacation_year": 2026,
            "comment": "no-order-test",
        }
    )
    # Инициируем транзакции
    from app.services.vacation_period_service import auto_use_days
    await auto_use_days(
        db=db_session,
        employee_id=employee.id,
        days_to_use=10,
        hire_date=employee.hire_date,
        additional_days=0,
        order_id=None,
        order_number=None,
        vacation_id=vacation.id,
        transaction_type="vacation_use",
        original_order_id=None,
        is_recalc=False,
    )
    await db_session.commit()

    # Проверяем наличие транзакций
    txs = (await db_session.execute(
        select(VacationPeriodTransaction).where(VacationPeriodTransaction.vacation_id == vacation.id)
    )).scalars().all()
    assert len(txs) > 0

    # Удаляем отпуск. Должно пройти успешно!
    success = await vacation_service.delete_vacation(db_session, vacation.id, "admin")
    assert success is True

    # Проверяем, что отпуск удален
    db_session.expire_all()
    vac_db = await db_session.get(Vacation, vacation.id)
    assert vac_db is None
