from typing import Optional

ALL_TEMPLATE_VARIABLES = [
    # Base document
    {"name": "{doc_number}", "description": "Номер документа", "category": "Документ"},
    {"name": "{doc_date}", "description": "Дата документа (ДД.ММ.ГГГГ)", "category": "Документ"},
    {"name": "{doc_title}", "description": "Заголовок документа", "category": "Документ"},

    # Employee name
    {"name": "{full_name}", "description": "ФИО полностью", "category": "ФИО"},
    {"name": "{short_name}", "description": "Фамилия И.О.", "category": "ФИО"},
    {"name": "{last_name}", "description": "Фамилия", "category": "ФИО"},
    {"name": "{first_name}", "description": "Имя", "category": "ФИО"},
    {"name": "{middle_name}", "description": "Отчество", "category": "ФИО"},
    {"name": "{full_name_upper}", "description": "ФИО заглавными буквами", "category": "ФИО"},
    {"name": "{full_name_title}", "description": "ФИО с заглавной буквы", "category": "ФИО"},
    {"name": "{full_name_last_caps}", "description": "Фамилия заглавными, имя отчество обычными", "category": "ФИО"},
    {"name": "{last_name_upper}", "description": "Фамилия заглавными буквами", "category": "ФИО"},
    {"name": "{initials_before}", "description": "И.О.Фамилия (без пробелов)", "category": "ФИО"},
    {"name": "{last_name_then_initials}", "description": "Фамилия И.О. (без пробела)", "category": "ФИО"},
    {"name": "{initials}", "description": "Инициалы через подчеркивание (для имени файла)", "category": "ФИО"},

    # Work
    {"name": "{position}", "description": "Должность", "category": "Работа"},
    {"name": "{position_cap}", "description": "Должность (с заглавной буквы)", "category": "Работа"},
    {"name": "{department}", "description": "Подразделение", "category": "Работа"},
    {"name": "{tab_number}", "description": "Табельный номер", "category": "Работа"},

    # Dates
    {"name": "{hire_date}", "description": "Дата приема на работу", "category": "Даты"},
    {"name": "{contract_start}", "description": "Дата начала контракта", "category": "Даты"},
    {"name": "{contract_end}", "description": "Дата окончания контракта", "category": "Даты"},
    {"name": "{contract_end_years}", "description": "Срок контракта в годах", "category": "Даты"},
    {"name": "{trial_end}", "description": "Дата окончания испытательного срока", "category": "Даты"},
    {"name": "{trial_end_months}", "description": "Кол-во месяцев испытательного срока", "category": "Даты"},
    {"name": "{hire_order_date}", "description": "Дата приема (для приказа «Прием на работу»)", "category": "Даты"},
    {"name": "{dismissal_date}", "description": "Дата увольнения", "category": "Даты"},
    {"name": "{vacation_start}", "description": "Начало отпуска", "category": "Даты"},
    {"name": "{vacation_end}", "description": "Конец отпуска", "category": "Даты"},
    {"name": "{vacation_days}", "description": "Кол-во дней отпуска", "category": "Даты"},
    {"name": "{sick_leave_start}", "description": "Начало больничного", "category": "Даты"},
    {"name": "{sick_leave_end}", "description": "Конец больничного", "category": "Даты"},
    {"name": "{sick_leave_days}", "description": "Кол-во дней больничного", "category": "Даты"},
    {"name": "{transfer_date}", "description": "Дата перевода", "category": "Даты"},
    {"name": "{contract_new_end}", "description": "Новая дата конца контракта", "category": "Даты"},
    {"name": "{call_date}", "description": "Дата вызова", "category": "Даты"},
    {"name": "{call_date_start}", "description": "Дата начала вызова", "category": "Даты"},
    {"name": "{call_date_end}", "description": "Дата окончания вызова", "category": "Даты"},
    {"name": "{recall_date}", "description": "Дата отзыва из отпуска", "category": "Даты"},
    {"name": "{application_date}", "description": "Дата заявления", "category": "Даты"},

    # Order-specific
    {"name": "{order_number}", "description": "Номер приказа", "category": "Приказ"},
    {"name": "{order_date}", "description": "Дата приказа (ДД.ММ.ГГГГ)", "category": "Приказ"},
    {"name": "{order_type_name}", "description": "Название типа приказа", "category": "Приказ"},
    {"name": "{order_type_code}", "description": "Код типа приказа", "category": "Приказ"},
    {"name": "{order_type_lower}", "description": "Тип приказа строчными буквами", "category": "Приказ"},

    # Notification-specific
    {"name": "{notification_type_name}", "description": "Название типа уведомления", "category": "Уведомление"},
    {"name": "{notification_type_code}", "description": "Код типа уведомления", "category": "Уведомление"},

    # Statement-specific
    {"name": "{statement_type_name}", "description": "Название типа заявления", "category": "Заявление"},
    {"name": "{statement_type_code}", "description": "Код типа заявления", "category": "Заявление"},

    # Other
    {"name": "{oznak}", "description": "ознакомлен/ознакомлена (по полу сотрудника)", "category": "Прочее"},
    {"name": "{oznak_gender}", "description": "ознакомлен/ознакомлена (по полу сотрудника)", "category": "Прочее"},
    {"name": "{notes}", "description": "Комментарий к приказу", "category": "Прочее"},
    {"name": "{index}", "description": "Номер сотрудника в групповом документе", "category": "Прочее"},

    # Block markers (for group documents)
    {"name": "{employees_block_start}", "description": "Начало блока сотрудников", "category": "Блоки"},
    {"name": "{employees_block_end}", "description": "Конец блока сотрудников", "category": "Блоки"},
    {"name": "{applications_block_start}", "description": "Начало блока заявлений", "category": "Блоки"},
    {"name": "{applications_block_end}", "description": "Конец блока заявлений", "category": "Блоки"},
]


def get_template_variables(doc_type: Optional[str] = None) -> list[dict]:
    """Return all template variables.

    Args:
        doc_type: Ignored, kept for backward compatibility. All variables are always returned.
    """
    return ALL_TEMPLATE_VARIABLES
