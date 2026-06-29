import asyncio
from datetime import datetime, timedelta
from sqlalchemy import text
from app.core.config import settings
from app.core.database import async_session
from app.core.logging import logger
from app.api.backups import _create_backup_archive, _iter_backup_files, _delete_backup_file, _read_backup_meta, _read_config_json

# Уникальный 64-битный ключ для блокировки автоматического бэкапа (advisory lock)
BACKUP_SCHEDULER_LOCK_ID = 238290234

def determine_backup_type(dt: datetime) -> str:
    """Определяет тип бэкапа по дате (Monthly, Weekly, Daily)."""
    if dt.day == 1:
        return "monthly"
    elif dt.weekday() == 6:  # 6 - воскресенье
        return "weekly"
    return "daily"

async def run_backup_cycle():
    """Выполняет один цикл проверки и создания автоматического бэкапа."""
    config = _read_config_json()
    if not config.get("auto_enabled", False):
        return

    now = datetime.now()
    target_time_str = config.get("time_of_day", "23:00")
    try:
        parts = target_time_str.split(":")
        target_hour = int(parts[0])
        target_minute = int(parts[1])
    except Exception:
        logger.warning(f"Некорректный формат времени бэкапа: {target_time_str}. Используем 23:00")
        target_hour, target_minute = 23, 0

    target_time = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
    
    if now < target_time:
        return

    # 1. Проверяем, был ли уже создан бэкап сегодня
    latest_backups = _iter_backup_files()
    if latest_backups:
        latest_backup = latest_backups[0]
        try:
            mtime = datetime.fromtimestamp(latest_backup.stat().st_mtime)
            if mtime.date() == now.date():
                return
        except Exception:
            logger.warning("Не удалось прочитать mtime последнего бэкапа. Продолжаем проверку.")

    logger.info("Запуск проверки автоматического бэкапа", time=target_time_str)

    # 2. Пытаемся захватить распределенный лок в PostgreSQL
    try:
        async with async_session() as session:
            async with session.begin():
                logger.debug("Попытка захвата PostgreSQL advisory lock для бэкапа")
                result = await session.execute(
                    text("SELECT pg_try_advisory_xact_lock(:id)"),
                    {"id": BACKUP_SCHEDULER_LOCK_ID}
                )
                lock_acquired = result.scalar()
                
                if not lock_acquired:
                    logger.info("Другой воркер уже выполняет автоматический бэкап. Пропуск.")
                    return
                
                backup_type = determine_backup_type(now)
                logger.info(f"Лок получен. Запуск создания бэкапа типа: {backup_type}...")
                
                # 3. Запуск создания бэкапа в отдельном потоке (sync-to-async wrapper)
                backup_result = await asyncio.to_thread(_create_backup_archive, None, backup_type)
                logger.info("Автоматический бэкап успешно создан", result=backup_result)

                # 4. Выполнение GFS ротации
                rotate_backups()

    except Exception:
        logger.exception("Ошибка при выполнении автоматического бэкапа")

def rotate_backups():
    """Выполняет GFS-ротацию резервных копий."""
    logger.info("Запуск ротации бэкапов по стратегии GFS")
    
    backups_by_type = {
        "daily": [],
        "weekly": [],
        "monthly": [],
        "manual": []
    }
    
    for f in _iter_backup_files():
        meta = _read_backup_meta(f.name)
        b_type = (meta or {}).get("backup_type", "manual")
        if b_type in backups_by_type:
            backups_by_type[b_type].append(f)
        else:
            backups_by_type["manual"].append(f)
            
    deleted_count = 0

    # Ротация Daily (храним 7 последних)
    daily_list = backups_by_type["daily"]
    if len(daily_list) > 7:
        for f in daily_list[7:]:
            logger.info("Ротация: Удаление старого ежедневного бэкапа", filename=f.name)
            try:
                _delete_backup_file(f.name)
                deleted_count += 1
            except Exception:
                logger.exception("Ошибка при удалении файла ежедневного бэкапа", filename=f.name)
            
    # Ротация Weekly (храним 4 последних)
    weekly_list = backups_by_type["weekly"]
    if len(weekly_list) > 4:
        for f in weekly_list[4:]:
            logger.info("Ротация: Удаление старого еженедельного бэкапа", filename=f.name)
            try:
                _delete_backup_file(f.name)
                deleted_count += 1
            except Exception:
                logger.exception("Ошибка при удалении файла еженедельного бэкапа", filename=f.name)
            
    # Monthly и Manual не удаляются никогда
    logger.info("Ротация бэкапов завершена", deleted_count=deleted_count)

async def start_backup_scheduler():
    """Основной цикл планировщика."""
    logger.info("Автоматический планировщик бэкапов запущен (мониторинг динамических настроек)")
    
    while True:
        try:
            await run_backup_cycle()
        except Exception:
            logger.exception("Ошибка в цикле планировщика бэкапов")
        # Спим 30 секунд.
        await asyncio.sleep(30)

