from pathlib import Path

from app.core.config import settings

ORDER_TYPE_MAP = {
    "Прием на работу": "прием",
    "Увольнение": "увольнение",
    "Отпуск трудовой": "отпуск",
    "Отпуск за свой счет": "отпуск_бс",
    "Больничный": "больничный",
    "Перевод": "перевод",
    "Продление контракта": "продление",
}

TEMPLATE_MAP = {
    "Прием на работу": "prikaz_priem.docx",
    "Увольнение": "prikaz_uvolnenie.docx",
    "Отпуск трудовой": "prikaz_otpusk_trudovoy.docx",
    "Отпуск за свой счет": "prikaz_otpusk_svoy_schet.docx",
    "Больничный": "prikaz_bolnichnyy.docx",
    "Перевод": "prikaz_perevod.docx",
    "Продление контракта": "prikaz_prodlenie_kontrakta.docx",
}

ORDER_TYPES = list(ORDER_TYPE_MAP.keys())


def get_order_type_short(order_type: str) -> str:
    return ORDER_TYPE_MAP.get(order_type, "приказ")


def get_template_filename(order_type: str) -> str | None:
    return TEMPLATE_MAP.get(order_type)


def extract_name_parts(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split()
    if not parts:
        return "Unknown", ""
    last_name = parts[0]
    initials = "_".join([p[0] for p in parts[1:]]) if len(parts) > 1 else ""
    return last_name, initials


def get_personal_files_dir(tab_number: int) -> Path:
    return Path(settings.PERSONAL_FILES_PATH) / str(tab_number)
