"""Тест закрытия периода с реальными отпусками"""
import pytest
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.employee import Employee
from app.models.vacation import Vacation
from app.models.vacation_period import VacationPeriod
from app.services.vacation_period_service import vacation_period_service


# Тестовая база данных в памяти
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db_session():
    """Создаёт тестовую сессию БД"""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        yield session
    
    await engine.dispose()


@pytest.fixture
async def test_employee(db_session: AsyncSession):
    """Создаёт тестового сотрудника"""
    employee = Employee(
        name="Петров Петр Петрович",
        tab_number="54321",
        department="HR",
        position="Менеджер",
        contract_start=date(2023, 1, 1),  # Начал работать в 2023
        additional_vacation_days=10,
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)
    return employee


@pytest.mark.asyncio
async def test_close_period_with_existing_vacations(db_session: AsyncSession, test_employee: Employee):
    """
    Тест закрытия периода, когда у сотрудника уже есть отпуска.
    Проверяем, что used_days увеличивается на оставшиеся дни.
    """
    
    # 1. Создаём периоды отпусков
    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        test_employee.id,
        test_employee.contract_start,
        test_employee.additional_vacation_days
    )
    
    # 2. Получаем первый (старый) период - он уже завершился
    periods = await vacation_period_service.get_employee_periods(
        db_session,
        test_employee.id
    )
    
    # Берем самый старый период (первый год работы)
    old_period = [p for p in periods if p.year_number == 1][0]
    period_id = old_period.period_id
    
    print(f"\n=== ПЕРИОД ДО ДОБАВЛЕНИЯ ОТПУСКОВ ===")
    print(f"Период: {old_period.year_number}-й год")
    print(f"Даты: {old_period.period_start} — {old_period.period_end}")
    print(f"Всего дней: {old_period.total_days}")
    print(f"Использовано дней: {old_period.used_days}")
    print(f"Остаток дней: {old_period.remaining_days}")
    
    # 3. Добавляем отпуск в этот период (10 дней)
    vacation = Vacation(
        employee_id=test_employee.id,
        start_date=date(2023, 6, 1),
        end_date=date(2023, 6, 10),
        vacation_type="Трудовой",
        days_count=10,
        vacation_year=2023,
    )
    db_session.add(vacation)
    await db_session.commit()
    
    # Обновляем used_days в периоде
    from app.repositories.vacation_period_repository import VacationPeriodRepository
    repo = VacationPeriodRepository()
    await repo.add_used_days(db_session, period_id, 10)
    await db_session.commit()
    
    # 4. Проверяем состояние ПОСЛЕ добавления отпуска
    periods_after_vacation = await vacation_period_service.get_employee_periods(
        db_session,
        test_employee.id
    )
    period_with_vacation = [p for p in periods_after_vacation if p.period_id == period_id][0]
    
    print(f"\n=== ПОСЛЕ ДОБАВЛЕНИЯ ОТПУСКА (10 дней) ===")
    print(f"Всего дней: {period_with_vacation.total_days}")
    print(f"Использовано дней: {period_with_vacation.used_days}")
    print(f"Остаток дней: {period_with_vacation.remaining_days}")
    
    assert period_with_vacation.used_days == 10, "Должно быть использовано 10 дней"
    assert period_with_vacation.remaining_days == period_with_vacation.total_days - 10, \
        f"Остаток должен быть {period_with_vacation.total_days - 10}"
    
    remaining_before_close = period_with_vacation.remaining_days
    
    # 5. Закрываем период
    print(f"\n=== ЗАКРЫВАЕМ ПЕРИОД ===")
    print(f"Остаток дней перед закрытием: {remaining_before_close}")
    
    closed_period = await vacation_period_service.close_period(
        db_session,
        period_id
    )
    
    print(f"\n=== ПОСЛЕ ЗАКРЫТИЯ (из ответа API) ===")
    print(f"Всего дней: {closed_period.total_days}")
    print(f"Использовано дней: {closed_period.used_days}")
    print(f"Остаток дней: {closed_period.remaining_days}")
    
    # Проверяем что used_days = total_days
    assert closed_period.used_days == closed_period.total_days, \
        f"После закрытия used_days ({closed_period.used_days}) должно равняться total_days ({closed_period.total_days})"
    assert closed_period.remaining_days == 0, "После закрытия remaining_days должно быть 0"
    
    # 6. Проверяем через get_employee_periods
    periods_after_close = await vacation_period_service.get_employee_periods(
        db_session,
        test_employee.id
    )
    closed_check = [p for p in periods_after_close if p.period_id == period_id][0]
    
    print(f"\n=== ПОСЛЕ ЗАКРЫТИЯ (из get_employee_periods) ===")
    print(f"Всего дней: {closed_check.total_days}")
    print(f"Использовано дней: {closed_check.used_days}")
    print(f"Остаток дней: {closed_check.remaining_days}")
    
    assert closed_check.used_days == closed_check.total_days, \
        "В get_employee_periods used_days должно равняться total_days"
    assert closed_check.remaining_days == 0, \
        "В get_employee_periods remaining_days должно быть 0"
    
    print(f"\n✅ Тест пройден!")
    print(f"   - Было использовано: 10 дней (отпуск)")
    print(f"   - Осталось перед закрытием: {remaining_before_close} дней")
    print(f"   - После закрытия использовано: {closed_check.used_days} дней (все)")
    print(f"   - Списано при закрытии: {remaining_before_close} дней")
