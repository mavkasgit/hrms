from typing import Optional

COMMON_TEMPLATE_VARIABLES = [
    {"name": "{doc_number}", "description": "Номер документа", "category": "Документ", "doc_types": ["order", "notification", "statement"]},
    {"name": "{doc_date}", "description": "Дата документа (ДД.ММ.ГГГГ)", "category": "Документ", "doc_types": ["order", "notification", "statement"]},
    {"name": "{doc_title}", "description": "Заголовок документа", "category": "Документ", "doc_types": ["order", "notification", "statement"]},

    {"name": "{full_name}", "description": "ФИО полностью", "category": "ФИО", "doc_types": ["order", "notification", "statement"]},
    {"name": "{short_name}", "description": "Фамилия И.О.", "category": "ФИО", "doc_types": ["order", "notification", "statement"]},
    {"name": "{last_name}", "description": "Фамилия", "category": "ФИО", "doc_types": ["order", "notification", "statement"]},
    {"name": "{position}", "description": "Должность", "category": "Работа", "doc_types": ["order", "notification", "statement"]},
    {"name": "{department}", "description": "Подразделение", "category": "Работа", "doc_types": ["order", "notification", "statement"]},
    {"name": "{tab_number}", "description": "Табельный номер", "category": "Работа", "doc_types": ["order", "notification", "statement"]},
]

ORDER_TEMPLATE_VARIABLES = [
    {"name": "{order_number}", "description": "Номер приказа", "category": "Приказ", "doc_types": ["order"]},
    {"name": "{order_date}", "description": "Дата приказа (ДД.ММ.ГГГГ)", "category": "Приказ", "doc_types": ["order"]},
    {"name": "{order_type_name}", "description": "Название типа приказа", "category": "Приказ", "doc_types": ["order"]},
    {"name": "{order_type_code}", "description": "Код типа приказа", "category": "Приказ", "doc_types": ["order"]},
    {"name": "{order_type_lower}", "description": "Тип приказа строчными буквами", "category": "Приказ", "doc_types": ["order"]},

    {"name": "{full_name_upper}", "description": "ФИО заглавными буквами", "category": "ФИО", "doc_types": ["order"]},
    {"name": "{full_name_title}", "description": "ФИО с заглавной буквы", "category": "ФИО", "doc_types": ["order"]},
    {"name": "{full_name_last_caps}", "description": "Фамилия заглавными, имя отчество обычными", "category": "ФИО", "doc_types": ["order"]},
    {"name": "{last_name_upper}", "description": "Фамилия заглавными буквами", "category": "ФИО", "doc_types": ["order"]},
    {"name": "{initials_before}", "description": "И.О.Фамилия (без пробелов)", "category": "ФИО", "doc_types": ["order"]},
    {"name": "{last_name_then_initials}", "description": "Фамилия И.О. (без пробела)", "category": "ФИО", "doc_types": ["order"]},
    {"name": "{initials}", "description": "Инициалы через подчеркивание (для имени файла)", "category": "ФИО", "doc_types": ["order"]},

    {"name": "{position_cap}", "description": "Должность (с заглавной буквы)", "category": "Работа", "doc_types": ["order"]},

    {"name": "{hire_date}", "description": "Дата приема на работу", "category": "Даты", "doc_types": ["order"]},
    {"name": "{contract_start}", "description": "Дата начала контракта", "category": "Даты", "doc_types": ["order"]},
    {"name": "{contract_end}", "description": "Дата окончания контракта", "category": "Даты", "doc_types": ["order"]},
    {"name": "{contract_end_years}", "description": "Срок контракта в годах", "category": "Даты", "doc_types": ["order"]},
    {"name": "{trial_end}", "description": "Дата окончания испытательного срока", "category": "Даты", "doc_types": ["order"]},
    {"name": "{trial_end_months}", "description": "Кол-во месяцев испытательного срока", "category": "Даты", "doc_types": ["order"]},
    {"name": "{hire_order_date}", "description": "Дата приема (для приказа «Прием на работу»)", "category": "Даты", "doc_types": ["order"]},
    {"name": "{dismissal_date}", "description": "Дата увольнения", "category": "Даты", "doc_types": ["order"]},
    {"name": "{vacation_start}", "description": "Начало отпуска", "category": "Даты", "doc_types": ["order"]},
    {"name": "{vacation_end}", "description": "Конец отпуска", "category": "Даты", "doc_types": ["order"]},
    {"name": "{vacation_days}", "description": "Кол-во дней отпуска", "category": "Даты", "doc_types": ["order"]},
    {"name": "{sick_leave_start}", "description": "Начало больничного", "category": "Даты", "doc_types": ["order"]},
    {"name": "{sick_leave_end}", "description": "Конец больничного", "category": "Даты", "doc_types": ["order"]},
    {"name": "{sick_leave_days}", "description": "Кол-во дней больничного", "category": "Даты", "doc_types": ["order"]},
    {"name": "{transfer_date}", "description": "Дата перевода", "category": "Даты", "doc_types": ["order"]},
    {"name": "{contract_new_end}", "description": "Новая дата конца контракта", "category": "Даты", "doc_types": ["order"]},
    {"name": "{call_date}", "description": "Дата вызова", "category": "Даты", "doc_types": ["order"]},
    {"name": "{call_date_start}", "description": "Дата начала вызова", "category": "Даты", "doc_types": ["order"]},
    {"name": "{call_date_end}", "description": "Дата окончания вызова", "category": "Даты", "doc_types": ["order"]},
    {"name": "{recall_date}", "description": "Дата отзыва из отпуска", "category": "Даты", "doc_types": ["order"]},

    {"name": "{oznak_gender}", "description": "ознакомлен/ознакомлена (по полу сотрудника)", "category": "Прочее", "doc_types": ["order"]},
    {"name": "{notes}", "description": "Комментарий к приказу", "category": "Прочее", "doc_types": ["order"]},
]

NOTIFICATION_TEMPLATE_VARIABLES = [
    {"name": "{notification_number}", "description": "Номер уведомления", "category": "Уведомление", "doc_types": ["notification"]},
    {"name": "{notification_date}", "description": "Дата уведомления", "category": "Уведомление", "doc_types": ["notification"]},
    {"name": "{notification_title}", "description": "Заголовок уведомления", "category": "Уведомление", "doc_types": ["notification"]},
    {"name": "{notification_content}", "description": "Содержание уведомления", "category": "Уведомление", "doc_types": ["notification"]},
]

STATEMENT_TEMPLATE_VARIABLES = [
    {"name": "{statement_number}", "description": "Номер заявления", "category": "Заявление", "doc_types": ["statement"]},
    {"name": "{statement_date}", "description": "Дата заявления", "category": "Заявление", "doc_types": ["statement"]},
    {"name": "{statement_title}", "description": "Заголовок заявления", "category": "Заявление", "doc_types": ["statement"]},
    {"name": "{statement_type}", "description": "Тип заявления", "category": "Заявление", "doc_types": ["statement"]},
    {"name": "{statement_content}", "description": "Содержание заявления", "category": "Заявление", "doc_types": ["statement"]},
]

ALL_VARIABLES = (
    COMMON_TEMPLATE_VARIABLES
    + ORDER_TEMPLATE_VARIABLES
    + NOTIFICATION_TEMPLATE_VARIABLES
    + STATEMENT_TEMPLATE_VARIABLES
)


def get_template_variables(doc_type: Optional[str] = None) -> list[dict]:
    """Return template variables, optionally filtered by doc_type.

    Args:
        doc_type: One of 'order', 'notification', 'statement', or None for all.
    """
    if doc_type is None:
        # Return all variables (backward-compatible view)
        return [
            {"name": v["name"], "description": v["description"], "category": v["category"]}
            for v in ALL_VARIABLES
        ]

    return [
        {"name": v["name"], "description": v["description"], "category": v["category"]}
        for v in ALL_VARIABLES
        if doc_type in v["doc_types"]
    ]
