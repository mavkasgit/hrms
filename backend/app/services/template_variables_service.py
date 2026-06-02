from typing import Optional

ALL_TEMPLATE_VARIABLES = [
    # Base document
    {"key": "doc_number", "name": "{doc_number}", "displayName": "Номер", "description": "Номер документа", "category": "Документ"},
    {"key": "doc_date", "name": "{doc_date}", "displayName": "Дата док.", "description": "Дата документа в формате ДД.ММ.ГГГГ", "category": "Документ"},
    {"key": "doc_title", "name": "{doc_title}", "displayName": "Заголовок", "description": "Заголовок документа (название приказа, уведомления или заявления)", "category": "Документ"},
    {"key": "old_contract_number", "name": "{old_contract_number}", "displayName": "Номер ст. контр.", "description": "Номер старого (предыдущего) контракта — используется в уведомлениях о продлении", "category": "Документ"},
    {"key": "new_contract_number", "name": "{new_contract_number}", "displayName": "Номер нов. контр.", "description": "Номер нового контракта, присваиваемый при оформлении приказа", "category": "Документ"},

    # Employee name
    {"key": "full_name", "name": "{full_name}", "displayName": "ФИО", "description": "ФИО сотрудника полностью: Фамилия Имя Отчество", "category": "ФИО"},
    {"key": "short_name", "name": "{short_name}", "displayName": "Фамилия И.О.", "description": "Фамилия и инициалы: Иванов И.О.", "category": "ФИО"},
    {"key": "last_name", "name": "{last_name}", "displayName": "Фамилия", "description": "Только фамилия сотрудника", "category": "ФИО"},
    {"key": "first_name", "name": "{first_name}", "displayName": "Имя", "description": "Только имя сотрудника", "category": "ФИО"},
    {"key": "middle_name", "name": "{middle_name}", "displayName": "Отчество", "description": "Только отчество сотрудника", "category": "ФИО"},
    {"key": "full_name_upper", "name": "{full_name_upper}", "displayName": "ФИО ЗАГЛАВН.", "description": "ФИО полностью заглавными буквами: ИВАНОВ ИВАН ИВАНОВИЧ", "category": "ФИО"},
    {"key": "full_name_title", "name": "{full_name_title}", "displayName": "ФИО Заглавн.", "description": "ФИО с заглавной буквы каждое слово", "category": "ФИО"},
    {"key": "full_name_last_caps", "name": "{full_name_last_caps}", "displayName": "ФАМИЛИЯ И.О.", "description": "Фамилия заглавными, имя и отчество обычными: ИВАНОВ Иван Иванович", "category": "ФИО"},
    {"key": "last_name_upper", "name": "{last_name_upper}", "displayName": "ФАМИЛИЯ", "description": "Фамилия заглавными буквами", "category": "ФИО"},
    {"key": "initials_before", "name": "{initials_before}", "displayName": "И.О.Фамилия", "description": "Инициалы перед фамилией без пробелов: И.О.Фамилия", "category": "ФИО"},
    {"key": "last_name_then_initials", "name": "{last_name_then_initials}", "displayName": "Фамилия И.О.", "description": "Фамилия затем инициалы без пробела: ФамилияИ.О.", "category": "ФИО"},
    {"key": "initials", "name": "{initials}", "description": "Инициалы через подчёркивание для имён файлов: И_О", "displayName": "Инициалы", "category": "ФИО"},

    # Work
    {"key": "position", "name": "{position}", "displayName": "Должность", "description": "Должность сотрудника строчными буквами", "category": "Работа"},
    {"key": "position_cap", "name": "{position_cap}", "displayName": "Должность (загл.)", "description": "Должность с заглавной буквы", "category": "Работа"},
    {"key": "new_position", "name": "{new_position}", "displayName": "Новая должность", "description": "Новая должность при переводе строчными буквами", "category": "Работа"},
    {"key": "new_position_cap", "name": "{new_position_cap}", "displayName": "Новая должность (загл.)", "description": "Новая должность при переводе с заглавной буквы", "category": "Работа"},
    {"key": "department", "name": "{department}", "displayName": "Подразделение", "description": "Название подразделения/отдела", "category": "Работа"},
    {"key": "tab_number", "name": "{tab_number}", "displayName": "Таб. номер", "description": "Табельный номер сотрудника", "category": "Работа"},

    # Dates — Hire
    {"key": "hire_date", "name": "{hire_date}", "displayName": "Дата приема", "description": "Дата приема на работу в формате ДД.ММ.ГГГГ", "category": "Даты"},
    {"key": "hire_order_date", "name": "{hire_order_date}", "displayName": "Дата приема (приказ)", "description": "Дата приема для приказа «Прием на работу»", "category": "Даты"},

    # Dates — Contract
    {"key": "contract_start", "name": "{contract_start}", "displayName": "Начало контр.", "description": "Дата начала контракта в формате ДД.ММ.ГГГГ", "category": "Даты"},
    {"key": "contract_end", "name": "{contract_end}", "displayName": "Конец контр.", "description": "Дата окончания контракта в формате ДД.ММ.ГГГГ", "category": "Даты"},
    {"key": "contract_end_years", "name": "{contract_end_years}", "displayName": "Срок (лет)", "description": "Срок контракта в годах (рассчитывается автоматически)", "category": "Даты"},

    # Dates — Contract extension
    {"key": "old_contract_start", "name": "{old_contract_start}", "displayName": "Начало ст. контр.", "description": "Дата начала старого (предыдущего) контракта", "category": "Даты"},
    {"key": "old_contract_end", "name": "{old_contract_end}", "displayName": "Конец ст. контр.", "description": "Дата окончания старого (предыдущего) контракта", "category": "Даты"},
    {"key": "new_contract_start", "name": "{new_contract_start}", "displayName": "Начало нов. контр.", "description": "Дата начала нового контракта", "category": "Даты"},
    {"key": "new_contract_end", "name": "{new_contract_end}", "displayName": "Конец нов. контр.", "description": "Дата окончания нового контракта", "category": "Даты"},
    {"key": "new_contract_years", "name": "{new_contract_years}", "displayName": "Срок продл. (лет)", "description": "Срок продления контракта в годах", "category": "Даты"},

    # Dates — Trial
    {"key": "trial_end", "name": "{trial_end}", "displayName": "Конец исп. срока", "description": "Дата окончания испытательного срока", "category": "Даты"},
    {"key": "trial_end_months", "name": "{trial_end_months}", "displayName": "Исп. срок (мес)", "description": "Количество месяцев испытательного срока", "category": "Даты"},

    # Dates — Dismissal
    {"key": "dismissal_date", "name": "{dismissal_date}", "displayName": "Дата увольн.", "description": "Дата увольнения сотрудника", "category": "Даты"},

    # Dates — Vacation
    {"key": "vacation_start", "name": "{vacation_start}", "displayName": "Начало отп.", "description": "Дата начала отпуска", "category": "Даты"},
    {"key": "vacation_end", "name": "{vacation_end}", "displayName": "Конец отп.", "description": "Дата окончания отпуска", "category": "Даты"},
    {"key": "vacation_days", "name": "{vacation_days}", "displayName": "Дни отп.", "description": "Количество дней отпуска", "category": "Даты"},
    {"key": "recall_date", "name": "{recall_date}", "displayName": "Дата отзыва", "description": "Дата отзыва сотрудника из отпуска", "category": "Даты"},

    # Dates — Sick leave
    {"key": "sick_leave_start", "name": "{sick_leave_start}", "displayName": "Начало бол.", "description": "Дата начала больничного листа", "category": "Даты"},
    {"key": "sick_leave_end", "name": "{sick_leave_end}", "displayName": "Конец бол.", "description": "Дата окончания больничного листа", "category": "Даты"},
    {"key": "sick_leave_days", "name": "{sick_leave_days}", "displayName": "Дни бол.", "description": "Количество дней больничного", "category": "Даты"},

    # Dates — Transfer
    {"key": "transfer_date", "name": "{transfer_date}", "displayName": "Дата перев.", "description": "Дата перевода на другую должность", "category": "Даты"},

    # Dates — Call
    {"key": "call_date", "name": "{call_date}", "displayName": "Дата вызова", "description": "Дата вызова сотрудника", "category": "Даты"},
    {"key": "call_date_start", "name": "{call_date_start}", "displayName": "Начало вызова", "description": "Дата начала вызова", "category": "Даты"},
    {"key": "call_date_end", "name": "{call_date_end}", "displayName": "Конец вызова", "description": "Дата окончания вызова", "category": "Даты"},

    # Dates — Application
    {"key": "application_date", "name": "{application_date}", "displayName": "Дата заявл.", "description": "Дата заявления", "category": "Даты"},

    # Order-specific
    {"key": "order_number", "name": "{order_number}", "displayName": "№ приказа", "description": "Номер приказа", "category": "Приказ"},
    {"key": "order_date", "name": "{order_date}", "displayName": "Дата приказа", "description": "Дата приказа в формате ДД.ММ.ГГГГ", "category": "Приказ"},
    {"key": "order_type_name", "name": "{order_type_name}", "displayName": "Тип приказа", "description": "Название типа приказа (Прием на работу, Увольнение и т.д.)", "category": "Приказ"},
    {"key": "order_type_code", "name": "{order_type_code}", "displayName": "Код приказа", "description": "Код типа приказа (hire, dismissal и т.д.)", "category": "Приказ"},
    {"key": "order_type_lower", "name": "{order_type_lower}", "displayName": "Тип приказа (стр.)", "description": "Тип приказа строчными буквами", "category": "Приказ"},

    # Notification-specific
    {"key": "notification_type_name", "name": "{notification_type_name}", "displayName": "Тип увед.", "description": "Название типа уведомления", "category": "Уведомление"},
    {"key": "notification_type_code", "name": "{notification_type_code}", "displayName": "Код увед.", "description": "Код типа уведомления", "category": "Уведомление"},

    # Statement-specific
    {"key": "statement_type_name", "name": "{statement_type_name}", "displayName": "Тип заявл.", "description": "Название типа заявления", "category": "Заявление"},
    {"key": "statement_type_code", "name": "{statement_type_code}", "displayName": "Код заявл.", "description": "Код типа заявления", "category": "Заявление"},

    # Other
    {"key": "oznak", "name": "{oznak}", "displayName": "Ознакомлен", "description": "«ознакомлен» или «ознакомлена» в зависимости от пола сотрудника", "category": "Прочее"},
    {"key": "oznak_gender", "name": "{oznak_gender}", "displayName": "Ознакомлен (пол)", "description": "«ознакомлен»/«ознакомлена» по полу сотрудника", "category": "Прочее"},
    {"key": "agreement", "name": "{agreement}", "displayName": "Согласен", "description": "«согласен» или «согласна» в зависимости от пола сотрудника", "category": "Прочее"},
    {"key": "notes", "name": "{notes}", "displayName": "Комментарий", "description": "Комментарий к приказу", "category": "Прочее"},
    {"key": "index", "name": "{index}", "displayName": "№ сотр.", "description": "Порядковый номер сотрудника в групповом документе", "category": "Прочее"},

    # Block markers (for group documents)
    {"key": "employees_block_start", "name": "{employees_block_start}", "displayName": "Блок сотр. (нач.)", "description": "Маркер начала блока сотрудников в групповых документах", "category": "Блоки"},
    {"key": "employees_block_end", "name": "{employees_block_end}", "displayName": "Блок сотр. (кон.)", "description": "Маркер конца блока сотрудников в групповых документах", "category": "Блоки"},
    {"key": "applications_block_start", "name": "{applications_block_start}", "displayName": "Блок заявл. (нач.)", "description": "Маркер начала блока заявлений", "category": "Блоки"},
    {"key": "applications_block_end", "name": "{applications_block_end}", "displayName": "Блок заявл. (кон.)", "description": "Маркер конца блока заявлений", "category": "Блоки"},

    # Other fields used in order types
    {"key": "reason", "name": "{reason}", "displayName": "Основание", "description": "Основание для приказа (причина, ссылка на документ)", "category": "Прочее"},
    {"key": "comment", "name": "{comment}", "displayName": "Комментарий", "description": "Комментарий к документу", "category": "Прочее"},
    {"key": "vacation_postpone_start", "name": "{vacation_postpone_start}", "displayName": "Новое нач. отп.", "description": "Новая дата начала отпуска при переносе", "category": "Даты"},
    {"key": "vacation_postpone_end", "name": "{vacation_postpone_end}", "displayName": "Новый конец отп.", "description": "Новая дата окончания отпуска при переносе", "category": "Даты"},
]


def get_template_variables(doc_type: Optional[str] = None) -> list[dict]:
    """Return all template variables.

    Args:
        doc_type: Ignored, kept for backward compatibility. All variables are always returned.
    """
    return ALL_TEMPLATE_VARIABLES
