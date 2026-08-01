from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.SQL_ECHO,  # Управляется через переменную окружения SQL_ECHO
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


from fastapi import HTTPException, status


async def get_db():
    try:
        async with async_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    except (OSError, ConnectionRefusedError) as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="База данных временно недоступна (PostgreSQL не запущен)",
        )
    except Exception as e:
        err_msg = str(e).lower()
        if "connect call failed" in err_msg or "refused" in err_msg or "connection refused" in err_msg or "winerror 1225" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="База данных временно недоступна (PostgreSQL не запущен)",
            )
        raise


