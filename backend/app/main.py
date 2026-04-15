from contextlib import asynccontextmanager
import traceback

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_session
from app.core.logging import configure_logging, logger
from app.core.exceptions import HRMSException
from app.api.exception_handlers import hrms_exception_handler
from app.api.health import router as health_router
from app.api.employees import router as employees_router
from app.api.orders import router as orders_router
from app.api.templates import router as templates_router
from app.api.vacations import router as vacations_router
from app.api.vacation_periods_api import router as vacation_periods_router
from app.api.vacation_plans import router as vacation_plans_router
from app.api.references import router as references_router
from app.api.analytics import router as analytics_router
from app.api.departments import router as departments_router
from app.api.tags import router as tags_router
from app.api.positions import router as positions_router
from app.api.import_employees import router as import_router
from app.api.dev import router as dev_router


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
app.include_router(templates_router, prefix="/api")
app.include_router(vacations_router, prefix="/api")
app.include_router(vacation_periods_router, prefix="/api")
app.include_router(vacation_plans_router, prefix="/api")
app.include_router(references_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(departments_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(positions_router, prefix="/api")
app.include_router(import_router, prefix="/api")
app.include_router(dev_router, prefix="/api")


@app.get("/api/health")
async def health_check():
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception:
        return {"status": "ok", "db": "disconnected"}
