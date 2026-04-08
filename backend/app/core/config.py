import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent

_env_file = os.getenv("ENV_FILE", ".env.dev")

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://hrms_user:hrms_pass@localhost:5432/hrms_dev"
    DATABASE_URL_LOCAL: str = "postgresql+asyncpg://hrms_user:hrms_pass@localhost:5432/hrms_dev"
    ENV: str = "dev"

    SECRET_KEY: str = "dev-secret-key-change-in-prod"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    ORDERS_PATH: str = str(BASE_DIR / "data" / "orders")
    TEMPLATES_PATH: str = str(BASE_DIR / "data" / "templates")
    PERSONAL_FILES_PATH: str = str(BASE_DIR / "data" / "personal")

    MAX_PHOTO_SIZE: int = 5 * 1024 * 1024
    MAX_DOCUMENT_SIZE: int = 10 * 1024 * 1024
    MAX_PERSONAL_FILES_TOTAL: int = 50 * 1024 * 1024

    DOCUMENT_GENERATION_TIMEOUT: int = 60
    DB_QUERY_TIMEOUT: int = 30
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    LOG_LEVEL: str = "DEBUG"
    LOG_FILE: str = str(BASE_DIR / "logs" / "hrms.log")
    LOG_MAX_BYTES: int = 10 * 1024 * 1024
    LOG_BACKUP_COUNT: int = 5

    ALGORITHM: str = "HS256"

    model_config = {"env_file": _env_file, "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
