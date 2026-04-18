from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

router = APIRouter(prefix="/dev", tags=["dev"])

@router.post("/clear-all")
async def clear_all_data(db: AsyncSession = Depends(get_db)):
    """Очистить все данные (только для разработки)."""
    # Отключаем триггеры
    await db.execute(text("ALTER TABLE employees DISABLE TRIGGER ALL"))
    
    # Очищаем таблицы
    await db.execute(text("TRUNCATE TABLE vacation_periods, vacations, orders, order_types, vacation_plans, employees, departments, positions, employee_audit_log CASCADE"))
    
    # Включаем триггеры обратно
    await db.execute(text("ALTER TABLE employees ENABLE TRIGGER ALL"))
    
    await db.commit()
    
    return {"status": "cleared"}
