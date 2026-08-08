"""Единая точка правила «групповой приказ требует минимум двух сотрудников» (#88).

Проверка живёт на слое сервисов, потому что путь черновиков принимает сырой
payload (а не Pydantic-модель) — сервисный слой единственная точка, покрывающая
все входы создания одним правилом: форма, создание черновика, коммит черновика,
прямое обращение к API.
"""

from app.core.exceptions import HRMSException

GROUP_ORDER_MIN_EMPLOYEES = 2
GROUP_ORDER_MIN_EMPLOYEES_MESSAGE = "Групповой приказ требует минимум двух сотрудников"


def ensure_group_order_employee_count(employees) -> None:
    """Проверить, что в групповом приказе минимум два сотрудника.

    Raises:
        HRMSException: 422 с единым текстом, если сотрудников меньше двух.
    """
    if len(employees) < GROUP_ORDER_MIN_EMPLOYEES:
        raise HRMSException(
            GROUP_ORDER_MIN_EMPLOYEES_MESSAGE,
            "validation_error",
            status_code=422,
        )
