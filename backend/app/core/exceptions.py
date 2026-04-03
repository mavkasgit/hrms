class HRMSException(Exception):
    def __init__(self, message: str, error_code: str = "hrms_error", status_code: int = 500):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        super().__init__(self.message)


class NotFoundError(HRMSException):
    def __init__(self, message: str, error_code: str = "not_found"):
        super().__init__(message, error_code, status_code=404)


class EmployeeNotFoundError(NotFoundError):
    def __init__(self, tab_number: int):
        super().__init__(f"Сотрудник с табельным номером {tab_number} не найден", "employee_not_found")


class OrderNotFoundError(NotFoundError):
    def __init__(self, order_id: int):
        super().__init__(f"Приказ с ID {order_id} не найден", "order_not_found")


class VacationNotFoundError(NotFoundError):
    def __init__(self, vacation_id: int):
        super().__init__(f"Отпуск с ID {vacation_id} не найден", "vacation_not_found")


class DuplicateError(HRMSException):
    def __init__(self, message: str, error_code: str = "duplicate"):
        super().__init__(message, error_code, status_code=409)


class DuplicateTabNumberError(DuplicateError):
    def __init__(self, tab_number: int):
        super().__init__(f"Сотрудник с табельным номером {tab_number} уже существует", "duplicate_tab_number")


class EmployeeAlreadyArchivedError(HRMSException):
    def __init__(self, tab_number: int):
        super().__init__(f"Сотрудник с табельным номером {tab_number} уже архивирован", "employee_already_archived", status_code=400)


class EmployeeNotArchivedError(HRMSException):
    def __init__(self, tab_number: int):
        super().__init__(f"Сотрудник с табельным номером {tab_number} не архивирован", "employee_not_archived", status_code=400)


class EmployeeDeletedError(HRMSException):
    def __init__(self, tab_number: int):
        super().__init__(f"Сотрудник с табельным номером {tab_number} удалён", "employee_deleted", status_code=410)


class VacationOverlapError(HRMSException):
    def __init__(self, message: str = "Отпуска пересекаются"):
        super().__init__(message, "vacation_overlap", status_code=409)


class InsufficientVacationDaysError(HRMSException):
    def __init__(self, message: str = "Недостаточно дней отпуска"):
        super().__init__(message, "insufficient_vacation_days", status_code=400)


class EmployeeHasActiveProcessesError(HRMSException):
    def __init__(self, warnings: list[str]):
        message = "У сотрудника есть активные процессы: " + "; ".join(warnings)
        super().__init__(message, "employee_has_active_processes", status_code=400)
        self.warnings = warnings
