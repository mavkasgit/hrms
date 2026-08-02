import os
from pathlib import Path
from typing import Any
from pydantic import model_validator
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent

_env_file = os.getenv("ENV_FILE") or str(BASE_DIR.parent / ".env.dev")

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://hrms_user:hrms_pass@localhost:5432/hrms_dev"
    DATABASE_URL_LOCAL: str = "postgresql+asyncpg://hrms_user:hrms_pass@localhost:5432/hrms_dev"
    ENV: str = "dev"

    # Dev/test: password "dev" + magic Bearer "admin". Must be false in prod.
    DEV_BYPASS_AUTH: bool = True

    # Service-to-service API key (idp-ops reads employees). Header: X-Service-Key.
    # Empty → disabled. Never expires, no login required.
    SERVICE_API_KEY: str = ""

    # Break Glass (Emergency Access) configuration
    BREAK_GLASS_ENABLED: bool = False
    BREAK_GLASS_USER: str = "emergency_admin"
    BREAK_GLASS_PASSWORD: str = ""
    BREAK_GLASS_PASSWORD_HASH: str = ""

    KTM2000_SYNC_URL: str = "http://localhost:8010/api/integration/sync-employee"
    KTM2000_INTEGRATION_TOKEN: str = "ktm2000-integration-token-default"

    SECRET_KEY: str = "dev-secret-key-change-in-prod"
    # Per-app HS256 key (preferred). Never share with KTM — SSO is Authentik only.
    JWT_SECRET_KEY: str | None = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    ORDERS_PATH: str = str(BASE_DIR / "data" / "orders")
    TEMPLATES_PATH: str = str(BASE_DIR / "data" / "templates")
    PERSONAL_FILES_PATH: str = str(BASE_DIR / "data" / "personal")
    BACKUPS_PATH: str = str(BASE_DIR / "data" / "backups")
    POSTGRES_CONTAINER_NAME: str = "hrms-postgres"
    STAFFING_PATH: str = str(BASE_DIR / "data" / "staffing")
    NOTIFICATIONS_PATH: str = str(BASE_DIR / "data" / "notifications")
    STATEMENTS_PATH: str = str(BASE_DIR / "data" / "statements")
    TIMESHEET_SNAPSHOTS_PATH: str = str(BASE_DIR / "data" / "timesheet_snapshots")

    MAX_PHOTO_SIZE: int = 5 * 1024 * 1024
    MAX_DOCUMENT_SIZE: int = 10 * 1024 * 1024
    MAX_PERSONAL_FILES_TOTAL: int = 50 * 1024 * 1024

    DOCUMENT_GENERATION_TIMEOUT: int = 60
    DB_QUERY_TIMEOUT: int = 30
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    LOG_LEVEL: str = "DEBUG"
    LOG_FILE: str = str(BASE_DIR / "logs" / "hrms.log")
    LOG_MAX_BYTES: int = 50 * 1024 * 1024  # 50 МБ
    LOG_BACKUP_COUNT: int = 5             # 5 файлов = 250 МБ суммарно

    ONLYOFFICE_ENABLED: bool = False
    ONLYOFFICE_JWT_SECRET: str = "change-me"
    ONLYOFFICE_PUBLIC_URL: str = "http://localhost:8085"
    ONLYOFFICE_INTERNAL_URL: str = "http://localhost:8085"
    BACKEND_INTERNAL_CALLBACK_URL: str = ""
    APP_PUBLIC_URL: str = "http://localhost:8000"
    
    # SQL logging (set to True to see all SQL queries)
    SQL_ECHO: bool = False

    ALGORITHM: str = "HS256"

    # Sessions / login audit (hybrid JWT + user_sessions)
    TRUSTED_PROXY_COUNT: int = 1  # env TRUSTED_PROXY_COUNT; XFF peel from the right
    SESSION_LAST_SEEN_THROTTLE_SECONDS: int = 300
    LOGIN_EVENTS_RETENTION_DAYS: int = 90  # default window for list_login_events queries

    # OIDC / Authentik bridge (A3) — dual-run; false = local password/invite only
    AUTH_OIDC_ENABLED: bool = False
    AUTH_OIDC_ISSUER: str | None = None  # e.g. http://192.168.x.x:9000/application/o/hrms/
    AUTH_OIDC_CLIENT_ID: str | None = None
    AUTH_OIDC_CLIENT_SECRET: str | None = None  # empty for public+PKCE
    # Hint only — SPA uses window.location.origin (dev :5171 / prod :8081)
    AUTH_OIDC_REDIRECT_URI: str | None = None
    AUTH_OIDC_SCOPES: str = "openid profile email hrms_access"
    # Optional extra hosts or full issuers (comma-separated) accepted in id_token.iss
    # e.g. localhost,127.0.0.1,<LAN-IP> — do not hardcode; list aliases as needed
    AUTH_OIDC_ISSUER_ALIASES: str | None = None
    # Optional overrides; if empty, derived from issuer / discovery
    AUTH_OIDC_AUTHORIZATION_URL: str | None = None
    AUTH_OIDC_TOKEN_URL: str | None = None
    AUTH_OIDC_JWKS_URL: str | None = None
    AUTH_OIDC_END_SESSION_URL: str | None = None
    # JIT-создание локального User при первом OIDC-входе (иначе 403)
    AUTH_OIDC_ALLOW_JIT: bool = False
    # Phase-3: SSO-only mode (blocks password & invite login; redirect to Authentik SSO)
    AUTH_SSO_ONLY: bool = False
    AUTH_OIDC_LOGIN_HINT_ENABLED: bool = True

    # Authentik Admin API proxy (SSO-D) — token never exposed to FE
    # Empty AUTHENTIK_API_TOKEN → IdP admin proxy disabled (deep-links only)
    # AUTHENTIK_*_URL: absolute URL or "auto" (detect host LAN IP at runtime)
    AUTHENTIK_API_URL: str | None = "auto"
    AUTHENTIK_API_TOKEN: str | None = None
    AUTHENTIK_PUBLIC_URL: str | None = "auto"
    AUTHENTIK_PROFILE_TTL_SECONDS: int = 300
    OPS_PUBLIC_IP: str | None = None

    @model_validator(mode="before")
    @classmethod
    def expand_env_placeholders(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        import re
        ops_ip = (values.get("OPS_PUBLIC_IP") or values.get("ops_public_ip") or os.getenv("OPS_PUBLIC_IP") or "").strip()
        if not ops_ip or ops_ip.startswith("${"):
            from app.core.host_net import env_lan_ip, detect_lan_ip
            ops_ip = env_lan_ip() or detect_lan_ip() or "127.0.0.1"
        for k, v in list(values.items()):
            if isinstance(v, str) and "${" in v:
                def _repl(m: re.Match) -> str:
                    var_name = m.group(1)
                    if var_name == "OPS_PUBLIC_IP":
                        return ops_ip
                    val = values.get(var_name) or values.get(var_name.lower()) or os.getenv(var_name)
                    return str(val) if (val and not str(val).startswith("${")) else m.group(0)
                values[k] = re.sub(r"\$\{([A-Za-z0-9_]+)\}", _repl, v)
        return values

    @model_validator(mode="after")
    def resolve_auto_urls(self) -> "Settings":
        from app.core.host_net import env_lan_ip, detect_lan_ip, resolve_authentik_origin
        
        # Разрешение APP_PUBLIC_URL
        if self.APP_PUBLIC_URL == "auto":
            ip = env_lan_ip() or detect_lan_ip() or "localhost"
            port = 8081 if self.ENV == "prod" else (8080 if self.ENV == "test" else 5171)
            self.APP_PUBLIC_URL = f"http://{ip}:{port}"
            
        # Разрешение AUTH_OIDC_REDIRECT_URI
        if self.AUTH_OIDC_REDIRECT_URI == "auto":
            self.AUTH_OIDC_REDIRECT_URI = f"{self.APP_PUBLIC_URL}/auth/callback"
            
        # Разрешение AUTHENTIK_PUBLIC_URL
        if self.AUTHENTIK_PUBLIC_URL == "auto":
            self.AUTHENTIK_PUBLIC_URL = resolve_authentik_origin(None) or "http://localhost:9000"
            
        return self

    model_config = {"env_file": _env_file, "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
