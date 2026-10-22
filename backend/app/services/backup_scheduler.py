import asyncio
from datetime import datetime, timedelta
from sqlalchemy import text
from app.core.config import settings
from app.core.database import async_session
from app.core.logging import logger
from app.api.backups import _create_backup_archive, _iter_backup_files, _delete_backup_file, _read_backup_meta, _read_config_json
from app.services.backup_retention import plan_rotation_with_limits

import socket


def _is_db_port_open() -> bool:
    try:
        from urllib.parse import urlparse
        url_str = settings.DATABASE_URL
        if "+asyncpg" in url_str:
            url_str = url_str.replace("postgresql+asyncpg://", "http://")
        elif "postgresql://" in url_str:
            url_str = url_str.replace("postgresql://", "http://")
        parsed = urlparse(url_str)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 5432
        with socket.create_connection((host, port), timeout=0.1):
            return True
    except Exception:
        return False


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

    # 2. Пытаемся захватить распределенный лок в PostgreSQL (если БД доступна)
    if not _is_db_port_open():
        return

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
    """Выполняет GFS-ротацию резервных копий.

    Политика живёт в общем модуле ``backup_retention`` — том же, что использует
    внешняя копия, чтобы локальная и внешняя ротация не разъезжались.
    """
    logger.info("Запуск ротации бэкапов по стратегии GFS")

    entries: list[tuple[str, str]] = []
    for f in _iter_backup_files():
        meta = _read_backup_meta(f.name)
        entries.append((f.name, (meta or {}).get("backup_type", "manual")))

    to_delete = plan_rotation_with_limits(entries)
    deleted_count = 0
    for filename in to_delete:
        logger.info("Ротация: удаление старого бэкапа", filename=filename)
        try:
            _delete_backup_file(filename)
            deleted_count += 1
        except Exception:
            logger.exception("Ошибка при удалении файла бэкапа", filename=filename)

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

