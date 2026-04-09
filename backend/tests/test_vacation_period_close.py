"""Тесты для закрытия периодов отпусков"""
import pytest
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.employee import Employee
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
        name="Иванов Иван Иванович",
        tab_number="12345",
        department="IT",
        position="Разработчик",
        contract_start=date(2024, 1, 1),
        additional_vacation_days=10,
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)
    return employee


@pytest.mark.asyncio
async def test_close_period_full(db_session: AsyncSession, test_employee: Employee):
    """Тест полного закрытия периода - все дни должны быть списаны"""
    
    # 1. Создаём период отпусков
    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        test_employee.id,
        test_employee.contract_start,
        test_employee.additional_vacation_days
    )
    
    # 2. Получаем периоды ДО закрытия
    periods_before = await vacation_period_service.get_employee_periods(
        db_session,
        test_employee.id
    )
    
    assert len(periods_before) > 0, "Должен быть хотя бы один период"
    
    first_period = periods_before[0]
    period_id = first_period.period_id
    
    # Проверяем начальное состояние
    print(f"\n=== ДО ЗАКРЫТИЯ ===")
    print(f"Период ID: {first_period.period_id}")
    print(f"Год: {first_period.year_number}")
    print(f"Основные дни: {first_period.main_days}")
    print(f"Дополнительные дни: {first_period.additional_days}")
    print(f"Всего дней: {first_period.total_days}")
    print(f"Использовано дней: {first_period.used_days}")
    print(f"Остаток дней: {first_period.remaining_days}")
    
    assert first_period.remaining_days > 0, "До закрытия должны быть доступные дни"
    
    # Сохраняем реальное значение total_days (main + additional)
    real_total_days = first_period.main_days + first_period.additional_days
    initial_remaining = first_period.remaining_days
    
    # 3. Закрываем период полностью
    closed_period = await vacation_period_service.close_period(
        db_session,
        period_id
    )
    
    print(f"\n=== ПОСЛЕ ЗАКРЫТИЯ (из ответа API) ===")
    print(f"Всего дней: {closed_period.total_days}")
    print(f"Использовано дней: {closed_period.used_days}")
    print(f"Остаток дней: {closed_period.remaining_days}")
    
    # Проверяем ответ API
    assert closed_period.used_days == closed_period.total_days, \
        "После закрытия used_days должно равняться total_days"
    assert closed_period.remaining_days == 0, \
        "После закрытия remaining_days должно быть 0"
    
    # 4. Получаем периоды ПОСЛЕ закрытия (как это делает фронтенд)
    periods_after = await vacation_period_service.get_employee_periods(
        db_session,
        test_employee.id
    )
    
    # Находим закрытый период
    closed_period_check = next(
        (p for p in periods_after if p.period_id == period_id),
        None
    )
    
    assert closed_period_check is not None, "Закрытый период должен быть в списке"
    
    print(f"\n=== ПОСЛЕ ЗАКРЫТИЯ (из get_employee_periods) ===")
    print(f"Всего дней: {closed_period_check.total_days}")
    print(f"Использовано дней: {closed_period_check.used_days}")
    print(f"Остаток дней: {closed_period_check.remaining_days}")
    
    # Проверяем что данные корректны
    assert closed_period_check.used_days == closed_period_check.total_days, \
        "В get_employee_periods used_days должно равняться total_days"
    assert closed_period_check.remaining_days == 0, \
        "В get_employee_periods remaining_days должно быть 0"
    
    # Проверяем что total_days равен реальному значению (main + additional)
    assert closed_period_check.total_days == real_total_days, \
        f"Total days должно быть {real_total_days} (main + additional)"
    
    print(f"\n✅ Тест пройден: период закрыт, {initial_remaining} дней списано")


@pytest.mark.asyncio
async def test_partial_close_period(db_session: AsyncSession, test_employee: Employee):
    """Тест частичного закрытия периода - должно остаться указанное количество дней"""
    
    # 1. Создаём период отпусков
    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        test_employee.id,
        test_employee.contract_start,
        test_employee.additional_vacation_days
    )
    
    # 2. Получаем периоды ДО закрытия
    periods_before = await vacation_period_service.get_employee_periods(
        db_session,
        test_employee.id
    )
    
    first_period = periods_before[0]
    period_id = first_period.period_id
    
    print(f"\n=== ДО ЧАСТИЧНОГО ЗАКРЫТИЯ ===")
    print(f"Всего дней: {first_period.total_days}")
    print(f"Использовано дней: {first_period.used_days}")
    print(f"Остаток дней: {first_period.remaining_days}")
    
    # Используем реальное значение main_days + additional_days
    real_total_days = first_period.main_days + first_period.additional_days
    remaining_to_keep = 5  # Оставляем 5 дней
    
    # 3. Частично закрываем период
    partial_closed = await vacation_period_service.partial_close_period(
        db_session,
        period_id,
        remaining_to_keep
    )
    
    print(f"\n=== ПОСЛЕ ЧАСТИЧНОГО ЗАКРЫТИЯ (из ответа API) ===")
    print(f"Всего дней: {partial_closed.total_days}")
    print(f"Использовано дней: {partial_closed.used_days}")
    print(f"Остаток дней: {partial_closed.remaining_days}")
    
    # Проверяем ответ API
    assert partial_closed.remaining_days == remaining_to_keep, \
        f"Должно остаться {remaining_to_keep} дней"
    assert partial_closed.used_days == real_total_days - remaining_to_keep, \
        f"Должно быть использовано {real_total_days - remaining_to_keep} дней"
    
    # 4. Получаем периоды ПОСЛЕ частичного закрытия
    periods_after = await vacation_period_service.get_employee_periods(
        db_session,
        test_employee.id
    )
    
    partial_closed_check = next(
        (p for p in periods_after if p.period_id == period_id),
        None
    )
    
    print(f"\n=== ПОСЛЕ ЧАСТИЧНОГО ЗАКРЫТИЯ (из get_employee_periods) ===")
    print(f"Всего дней: {partial_closed_check.total_days}")
    print(f"Использовано дней: {partial_closed_check.used_days}")
    print(f"Остаток дней: {partial_closed_check.remaining_days}")
    
    # Проверяем что данные корректны
    assert partial_closed_check.remaining_days == remaining_to_keep, \
        f"Должно остаться {remaining_to_keep} дней"
    assert partial_closed_check.used_days == real_total_days - remaining_to_keep, \
        f"Должно быть использовано {real_total_days - remaining_to_keep} дней"
    
    print(f"\n✅ Тест пройден: период частично закрыт, осталось {remaining_to_keep} дней")


@pytest.mark.asyncio
async def test_restore_closed_period(db_session: AsyncSession, test_employee: Employee):
    """Тест восстановления закрытого периода через partial_close"""
    
    # 1. Создаём и закрываем период
    await vacation_period_service.ensure_periods_for_employee(
        db_session,
        test_employee.id,
        test_employee.contract_start,
        test_employee.additional_vacation_days
    )
    
    periods = await vacation_period_service.get_employee_periods(
        db_session,
        test_employee.id
    )
    
    period_id = periods[0].period_id
    # Используем реальное значение main_days + additional_days
    real_total = periods[0].main_days + periods[0].additional_days
    
    # Закрываем полностью
    await vacation_period_service.close_period(db_session, period_id)
    
    print(f"\n=== ПОСЛЕ ПОЛНОГО ЗАКРЫТИЯ ===")
    periods_closed = await vacation_period_service.get_employee_periods(
        db_session,
        test_employee.id
    )
    closed = next(p for p in periods_closed if p.period_id == period_id)
    print(f"Остаток дней: {closed.remaining_days}")
    assert closed.remaining_days == 0
    
    # 2. Восстанавливаем период (оставляем все дни)
    restored = await vacation_period_service.partial_close_period(
        db_session,
        period_id,
        real_total  # Восстанавливаем все дни (используем реальное значение)
    )
    
    print(f"\n=== ПОСЛЕ ВОССТАНОВЛЕНИЯ ===")
    print(f"Всего дней: {restored.total_days}")
    print(f"Использовано дней: {restored.used_days}")
    print(f"Остаток дней: {restored.remaining_days}")
    
    # Проверяем восстановление
    assert restored.remaining_days == real_total, \
        f"После восстановления должны быть доступны все {real_total} дней"
    assert restored.used_days == 0, \
        "После восстановления used_days должно быть 0"
    
    print(f"\n✅ Тест пройден: период восстановлен, доступно {real_total} дней")
