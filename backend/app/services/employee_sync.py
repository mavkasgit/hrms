import asyncio
import httpx
import structlog
from app.core.config import settings

logger = structlog.get_logger()


async def sync_employee_to_ktm_task(
    tab_number: int | None,
    name: str,
    position: str | None,
    department: str | None,
    is_deleted: bool,
):
    if not tab_number:
        logger.warning("Skipping KTM-2000 sync: tab_number is missing")
        return

    payload = {
        "tab_number": str(tab_number),
        "name": name,
        "position": position,
        "department": department,
        "is_deleted": is_deleted,
    }

    headers = {
        "X-Integration-Token": settings.KTM2000_INTEGRATION_TOKEN,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                settings.KTM2000_SYNC_URL, json=payload, headers=headers
            )
            if response.status_code == 200:
                logger.info(
                    "Successfully synced employee to KTM-2000",
                    tab_number=tab_number,
                )
            else:
                logger.error(
                    "Failed to sync employee to KTM-2000",
                    tab_number=tab_number,
                    status_code=response.status_code,
                    response=response.text,
                )
    except Exception as e:
        logger.error(
            "Exception occurred while syncing employee to KTM-2000",
            tab_number=tab_number,
            error=str(e),
        )


def sync_employee_to_ktm(
    tab_number: int | None,
    name: str,
    position: str | None,
    department: str | None,
    is_deleted: bool,
):
    """
    Запускает асинхронную задачу синхронизации сотрудника с KTM-2000 в фоновом режиме.
    """
    asyncio.create_task(
        sync_employee_to_ktm_task(
            tab_number=tab_number,
            name=name,
            position=position,
            department=department,
            is_deleted=is_deleted,
        )
    )
