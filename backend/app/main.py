from contextlib import asynccontextmanager
import traceback
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from jose import jwt, JWTError

from app.core.config import settings
from app.core.database import async_session
from app.core.logging import configure_logging, logger
from app.core.exceptions import HRMSException
from app.api.exception_handlers import hrms_exception_handler
from app.api.health import router as health_router
from app.api.employees import router as employees_router
from app.api.orders import router as orders_router
from app.api.order_types import router as order_types_router
from app.api.vacations import router as vacations_router
from app.api.sick_leaves import router as sick_leaves_router
from app.api.vacation_periods_api import router as vacation_periods_router
from app.api.vacation_plans import router as vacation_plans_router
from app.api.references import router as references_router
from app.api.analytics import router as analytics_router
from app.api.departments import router as departments_router
from app.api.tags import router as tags_router
from app.api.positions import router as positions_router
from app.api.import_employees import router as import_router
from app.api.dev import router as dev_router
from app.api.onlyoffice import router as onlyoffice_router
from app.api.backups import router as backups_router
from app.api.documents import router as documents_router
from app.api.notifications import router as notifications_router
from app.api.notification_types import router as notification_types_router
from app.api.statements import router as statements_router
from app.api.statement_types import router as statement_types_router
from app.api.contract_history import router as contract_history_router
from app.api.users import router as users_router
from app.api.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info("Starting HRMS application", env=settings.ENV)
    yield
    logger.info("Shutting down HRMS application")


app = FastAPI(
    title="HRMS",
    description="Система управления персоналом",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def check_write_access_middleware(request: Request, call_next):
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        path = request.url.path
        if path.startswith("/api") and path != "/api/health":
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header[7:]
                if token != "admin":
                    try:
                        secret_key = settings.JWT_SECRET_KEY or settings.SECRET_KEY
                        payload = jwt.decode(token, secret_key, algorithms=[settings.ALGORITHM])
                        exp = payload.get("exp")
                        if exp and exp < time.time():
                            return JSONResponse(
                                status_code=401,
                                content={"detail": "Token has expired"}
                            )
                        
                        hrms_access_level = payload.get("hrms_access_level", "no_access")
                        if hrms_access_level != "admin":
                            return JSONResponse(
                                status_code=403,
                                content={"detail": "Доступ запрещен. У вас есть права только на просмотр данных."}
                            )
                    except JWTError:
                        return JSONResponse(
                            status_code=401,
                            content={"detail": "Invalid or expired token"}
                        )
    response = await call_next(request)
    return response

app.add_exception_handler(HRMSException, hrms_exception_handler)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Глобальный обработчик исключений - логируем все необработанные ошибки."""
    error_trace = traceback.format_exc()
    logger.error(f"Unhandled exception: {exc}\n{error_trace}")
    print(f"\n=== GLOBAL EXCEPTION HANDLER ===")
    print(f"Error: {exc}")
    print(f"Traceback:\n{error_trace}")
    print(f"===============================\n")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

app.include_router(health_router, prefix="/api")
app.include_router(employees_router, prefix="/api")
app.include_router(orders_router, prefix="/api")
app.include_router(order_types_router, prefix="/api")
app.include_router(vacations_router, prefix="/api")
app.include_router(sick_leaves_router, prefix="/api")
app.include_router(vacation_periods_router, prefix="/api")
app.include_router(vacation_plans_router, prefix="/api")
app.include_router(references_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(departments_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(positions_router, prefix="/api")
app.include_router(import_router, prefix="/api")
app.include_router(dev_router, prefix="/api")
app.include_router(onlyoffice_router, prefix="/api")
app.include_router(backups_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(notification_types_router, prefix="/api")
app.include_router(statements_router, prefix="/api")
app.include_router(statement_types_router, prefix="/api")
app.include_router(contract_history_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(auth_router, prefix="/api")



@app.get("/api/health")
async def health_check():
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception:
        return {"status": "ok", "db": "disconnected"}
