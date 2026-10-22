"""GFS-ротация резервных копий.

Общая логика для локального каталога бэкапов и для внешней копии
(сетевой диск, SFTP, FTP, WebDAV, локальный путь).

Политика одинаковая в обоих местах: 7 последних ежедневных, 4 еженедельных,
ежемесячные и ручные — бессрочно. Пределы вынесены в ``ROTATION_LIMITS``,
значение ``0`` означает «не удалять никогда».
"""

from typing import Iterable, Sequence

# Тип бэкапа -> сколько последних копий хранить (0 = бессрочно).
ROTATION_LIMITS: dict[str, int] = {
    "daily": 7,
    "weekly": 4,
    "monthly": 0,
    "manual": 0,
}


def normalize_limits(raw: dict | None) -> dict[str, int]:
    """Приводит пользовательские лимиты к безопасному виду.

    Ноль и отрицательные значения трактуются как «хранить бессрочно».
    """
    limits = dict(ROTATION_LIMITS)
    if not isinstance(raw, dict):
        return limits
    for key in limits:
        if key not in raw:
            continue
        try:
            value = int(raw[key])
        except (TypeError, ValueError):
            continue
        limits[key] = max(0, value)
    return limits


def plan_rotation_with_limits(
    entries: Sequence[tuple[str, str]],
    limits: dict[str, int] | None = None,
) -> list[str]:
    """Возвращает имена бэкапов, которые нужно удалить.

    ``entries`` — пары ``(имя файла, тип бэкапа)``, отсортированные от новых
    к старым. Неизвестный или отсутствующий тип считается ``manual`` и
    не удаляется — так же ведёт себя локальная ротация.
    """
    limits = normalize_limits(limits)
    by_type: dict[str, list[str]] = {key: [] for key in ROTATION_LIMITS}
    for name, backup_type in entries:
        bucket = backup_type if backup_type in by_type else "manual"
        by_type[bucket].append(name)

    to_delete: list[str] = []
    for backup_type, limit in limits.items():
        if limit and len(by_type[backup_type]) > limit:
            to_delete.extend(by_type[backup_type][limit:])
    return to_delete
