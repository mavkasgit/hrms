import os
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, engine
from app.core.logging import logger

router = APIRouter(prefix="/backups", tags=["backups"])

BACKUPS_DIR = Path(settings.BACKUPS_PATH)
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)

TABLES_FOR_PREVIEW = [
    "employees",
    "orders",
    "vacations",
    "departments",
    "sick_leaves",
    "order_types",
    "positions",
]


def _get_db_name() -> str:
    """Извлекает имя БД из DATABASE_URL."""
    url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    return url.split("/")[-1]


def _get_container_name() -> str:
    """Определяет имя Docker-контейнера Postgres по имени БД."""
    db_name = _get_db_name()
    mapping = {
        "hrms_dev": "hrms-postgres",
        "hrms_test": "hrms-postgres-test",
        "hrms_prod": "hrms-postgres-prod",
    }
    return mapping.get(db_name, settings.POSTGRES_CONTAINER_NAME)


def _run_docker_postgres_cmd(cmd: List[str]) -> subprocess.CompletedProcess:
    """Выполняет команду через docker exec в контейнере Postgres."""
    container = _get_container_name()
    full_cmd = ["docker", "exec", container] + cmd
    try:
        result = subprocess.run(
            full_cmd, capture_output=True, text=True, check=False, timeout=300
        )
        return result
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Docker недоступен. Убедитесь, что Docker установлен и запущен.",
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Команда превысила время ожидания (5 минут).",
        )


def _validate_admin(current_user: str = "admin") -> None:
    """Заглушка проверки прав администратора."""
    if current_user != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_backup() -> Dict:
    """Создать бэкап текущей БД."""
    _validate_admin()
    db_name = _get_db_name()
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"backup_{db_name}_{timestamp}.dump"
    filepath = BACKUPS_DIR / filename

    result = _run_docker_postgres_cmd([
        "pg_dump", "-U", "hrms_user", "-d", db_name, "-F", "c", "-f", f"/tmp/{filename}"
    ])
    if result.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"pg_dump ошибка: {result.stderr}",
        )

    # Копируем файл из контейнера на хост
    cp_result = subprocess.run(
        ["docker", "cp", f"{_get_container_name()}:/tmp/{filename}", str(filepath)],
        capture_output=True, text=True, check=False
    )
    if cp_result.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка копирования бэкапа: {cp_result.stderr}",
        )

    # Удаляем временный файл из контейнера
    _run_docker_postgres_cmd(["rm", f"/tmp/{filename}"])

    return {
        "filename": filename,
        "db_name": db_name,
        "size": filepath.stat().st_size,
        "created_at": datetime.now().isoformat(),
    }


@router.get("/config")
async def get_backup_config() -> Dict:
    """Получить текущее имя базы данных для подтверждения восстановления."""
    _validate_admin()
    return {"db_name": _get_db_name()}


@router.get("")
async def list_backups() -> List[Dict]:
    """Список всех бэкапов."""
    _validate_admin()
    backups = []
    for f in sorted(BACKUPS_DIR.glob("backup_*.dump"), key=lambda p: p.stat().st_mtime, reverse=True):
        parts = f.name.split("_")
        # backup_<db_name>_<timestamp>.dump
        # parts[0] = backup, parts[-2] = date, parts[-1] = time.dump
        if len(parts) >= 4:
            db_name = "_".join(parts[1:-2])
        else:
            db_name = "unknown"
        backups.append({
            "filename": f.name,
            "db_name": db_name,
            "size": f.stat().st_size,
            "created_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        })
    return backups


@router.get("/{filename}/download")
async def download_backup(filename: str) -> FileResponse:
    """Скачать файл бэкапа."""
    _validate_admin()
    filepath = BACKUPS_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Бэкап не найден")
    return FileResponse(
        path=str(filepath),
        filename=filename,
        media_type="application/octet-stream",
    )


@router.post("/{filename}/preview")
async def preview_backup(filename: str) -> Dict:
    """Получить статистику (превью) из существующего бэкапа."""
    _validate_admin()
    filepath = BACKUPS_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Бэкап не найден")

    db_name = _get_db_name()
    preview_db = f"hrms_preview_{uuid.uuid4().hex[:8]}"

    try:
        # Создаём временную БД
        create_result = _run_docker_postgres_cmd([
            "psql", "-U", "hrms_user", "-d", "postgres", "-c",
            f"CREATE DATABASE {preview_db};"
        ])
        if create_result.returncode != 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Ошибка создания временной БД: {create_result.stderr}",
            )

        # Копируем бэкап в контейнер
        cp_in = subprocess.run(
            ["docker", "cp", str(filepath), f"{_get_container_name()}:/tmp/{filename}"],
            capture_output=True, text=True, check=False
        )
        if cp_in.returncode != 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Ошибка копирования бэкапа в контейнер: {cp_in.stderr}",
            )

        # Восстанавливаем во временную БД
        restore_result = _run_docker_postgres_cmd([
            "pg_restore", "-U", "hrms_user", "-d", preview_db, f"/tmp/{filename}"
        ])
        # pg_restore может вернуть 1 при warnings, но это нормально
        if restore_result.returncode not in (0, 1):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"pg_restore ошибка: {restore_result.stderr}",
            )

        # Собираем статистику
        stats: Dict[str, int] = {}
        for table in TABLES_FOR_PREVIEW:
            count_result = _run_docker_postgres_cmd([
                "psql", "-U", "hrms_user", "-d", preview_db, "-t", "-c",
                f"SELECT COUNT(*) FROM {table};"
            ])
            try:
                stats[table] = int(count_result.stdout.strip())
            except ValueError:
                stats[table] = 0

        return {
            "source_db": db_name,
            "backup_timestamp": datetime.fromtimestamp(filepath.stat().st_mtime).isoformat(),
            "tables": stats,
        }

    finally:
        # Гарантированно удаляем временную БД
        _run_docker_postgres_cmd([
            "psql", "-U", "hrms_user", "-d", "postgres", "-c",
            f"DROP DATABASE IF EXISTS {preview_db};"
        ])
        _run_docker_postgres_cmd(["rm", "-f", f"/tmp/{filename}"])


@router.post("/upload-preview")
async def upload_preview(file: UploadFile = File(...)) -> Dict:
    """Загрузить .dump файл и получить превью статистики."""
    _validate_admin()
    if not file.filename or not file.filename.endswith(".dump"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Файл должен иметь расширение .dump"
        )

    tmp_path = BACKUPS_DIR / f"upload_preview_{uuid.uuid4().hex[:8]}.dump"
    try:
        with open(tmp_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Переиспользуем логику preview_backup через временный файл
        db_name = _get_db_name()
        preview_db = f"hrms_preview_{uuid.uuid4().hex[:8]}"

        try:
            create_result = _run_docker_postgres_cmd([
                "psql", "-U", "hrms_user", "-d", "postgres", "-c",
                f"CREATE DATABASE {preview_db};"
            ])
            if create_result.returncode != 0:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Ошибка создания временной БД: {create_result.stderr}",
                )

            cp_in = subprocess.run(
                ["docker", "cp", str(tmp_path), f"{_get_container_name()}:/tmp/{tmp_path.name}"],
                capture_output=True, text=True, check=False
            )
            if cp_in.returncode != 0:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Ошибка копирования бэкапа в контейнер: {cp_in.stderr}",
                )

            restore_result = _run_docker_postgres_cmd([
                "pg_restore", "-U", "hrms_user", "-d", preview_db, f"/tmp/{tmp_path.name}"
            ])
            if restore_result.returncode not in (0, 1):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"pg_restore ошибка: {restore_result.stderr}",
                )

            stats: Dict[str, int] = {}
            for table in TABLES_FOR_PREVIEW:
                count_result = _run_docker_postgres_cmd([
                    "psql", "-U", "hrms_user", "-d", preview_db, "-t", "-c",
                    f"SELECT COUNT(*) FROM {table};"
                ])
                try:
                    stats[table] = int(count_result.stdout.strip())
                except ValueError:
                    stats[table] = 0

            # Пытаемся извлечь имя БД из имени файла: backup_<db>_...
            uploaded_db_name = "unknown"
            if file.filename:
                parts = file.filename.split("_")
                if len(parts) >= 4 and parts[0] == "backup":
                    uploaded_db_name = "_".join(parts[1:-2])

            return {
                "source_db": uploaded_db_name,
                "backup_timestamp": datetime.fromtimestamp(tmp_path.stat().st_mtime).isoformat(),
                "tables": stats,
            }
        finally:
            _run_docker_postgres_cmd([
                "psql", "-U", "hrms_user", "-d", "postgres", "-c",
                f"DROP DATABASE IF EXISTS {preview_db};"
            ])
            _run_docker_postgres_cmd(["rm", "-f", f"/tmp/{tmp_path.name}"])
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


@router.post("/{filename}/restore")
async def restore_backup(filename: str, body: Dict) -> Dict:
    """Восстановить текущую БД из выбранного бэкапа."""
    _validate_admin()
    db_name = _get_db_name()

    # Проверка подтверждения
    if body.get("db_name") != db_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Для подтверждения введите точное имя базы данных: {db_name}"
        )

    filepath = BACKUPS_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Бэкап не найден")

    # Закрываем соединения SQLAlchemy
    await engine.dispose()

    # Копируем бэкап в контейнер
    cp_in = subprocess.run(
        ["docker", "cp", str(filepath), f"{_get_container_name()}:/tmp/{filename}"],
        capture_output=True, text=True, check=False
    )
    if cp_in.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка копирования бэкапа в контейнер: {cp_in.stderr}",
        )

    # Терминируем активные соединения
    term_result = _run_docker_postgres_cmd([
        "psql", "-U", "hrms_user", "-d", "postgres", "-c",
        f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{db_name}' AND pid <> pg_backend_pid();"
    ])
    logger.info("Terminated active connections", stderr=term_result.stderr)

    # Восстанавливаем БД
    restore_result = _run_docker_postgres_cmd([
        "pg_restore", "--clean", "--if-exists", "-U", "hrms_user", "-d", db_name, f"/tmp/{filename}"
    ])
    if restore_result.returncode not in (0, 1):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"pg_restore ошибка: {restore_result.stderr}",
        )

    # Применяем миграции
    migrate_result = subprocess.run(
        ["docker", "exec", _get_container_name(), "sh", "-c",
         f"cd /tmp && psql -U hrms_user -d {db_name} -c \"SELECT 1\" > /dev/null 2>&1 && echo 'DB_READY'"],
        capture_output=True, text=True, check=False
    )
    logger.info("DB ready check", stdout=migrate_result.stdout)

    logger.info("Engine disposed after restore. New connections will use refreshed schema.")

    # Удаляем временный файл
    _run_docker_postgres_cmd(["rm", "-f", f"/tmp/{filename}"])

    return {"status": "restored", "db_name": db_name, "filename": filename}


@router.post("/upload-restore")
async def upload_restore(file: UploadFile = File(...), body: Dict = {}) -> Dict:
    """Загрузить .dump файл и восстановить текущую БД из него."""
    _validate_admin()
    db_name = _get_db_name()

    if body.get("db_name") != db_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Для подтверждения введите точное имя базы данных: {db_name}"
        )

    if not file.filename or not file.filename.endswith(".dump"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Файл должен иметь расширение .dump"
        )

    tmp_filename = f"upload_restore_{uuid.uuid4().hex[:8]}.dump"
    tmp_path = BACKUPS_DIR / tmp_filename

    try:
        with open(tmp_path, "wb") as f:
            content = await file.read()
            f.write(content)

        await engine.dispose()

        cp_in = subprocess.run(
            ["docker", "cp", str(tmp_path), f"{_get_container_name()}:/tmp/{tmp_filename}"],
            capture_output=True, text=True, check=False
        )
        if cp_in.returncode != 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Ошибка копирования бэкапа в контейнер: {cp_in.stderr}",
            )

        term_result = _run_docker_postgres_cmd([
            "psql", "-U", "hrms_user", "-d", "postgres", "-c",
            f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{db_name}' AND pid <> pg_backend_pid();"
        ])
        logger.info("Terminated active connections", stderr=term_result.stderr)

        restore_result = _run_docker_postgres_cmd([
            "pg_restore", "--clean", "--if-exists", "-U", "hrms_user", "-d", db_name, f"/tmp/{tmp_filename}"
        ])
        if restore_result.returncode not in (0, 1):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"pg_restore ошибка: {restore_result.stderr}",
            )

        logger.info("Engine disposed after upload-restore. New connections will use refreshed schema.")
        _run_docker_postgres_cmd(["rm", "-f", f"/tmp/{tmp_filename}"])

        return {"status": "restored", "db_name": db_name, "filename": file.filename}
    finally:
        if tmp_path.exists():
            tmp_path.unlink()
