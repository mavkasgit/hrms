"""Справочник типов смен.

Хранится в коде, а не в БД: набор типов фиксирован (не редактируется пользователем),
и UI-метаданные (название, времена, иконка, цвет) — это front-end concern.

Изменение списка = релиз (код + фронт), без миграций и сидинга.

Фронт мапит code → (label, icon, color) по этому же каталогу
(см. frontend/src/shared/config/shiftTypes.ts).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from typing import Dict, List, Optional


@dataclass(frozen=True)
class ShiftType:
    code: str
    name: str
    start_time: Optional[time]
    end_time: Optional[time]
    planned_hours: float
    is_working: bool
    is_night: bool
    sort_order: int


def _t(hh: int, mm: int) -> time:
    return time(hh, mm)


# Контрактные смены завода. times подобраны под фактический график.
SHIFT_TYPE_CATALOG: List[ShiftType] = [
    ShiftType("day", "День (08:00-16:30)", _t(8, 0), _t(16, 30), 8.0, True, False, 10),
    ShiftType("day_long", "День 12ч (08:00-20:00)", _t(8, 0), _t(20, 0), 12.0, True, False, 20),
    ShiftType("night", "Ночь 12ч (20:00-08:00)", _t(20, 0), _t(8, 0), 12.0, True, True, 30),
    ShiftType("evening", "Вечер (14:00-22:00)", _t(14, 0), _t(22, 0), 8.0, True, False, 60),
    ShiftType("off", "Выходной", None, None, 0.0, False, False, 100),
    ShiftType("vacation", "Отпуск", None, None, 0.0, False, False, 110),
    ShiftType("sick", "Больничный", None, None, 0.0, False, False, 120),
    ShiftType("A", "За свой счет", None, None, 0.0, False, False, 125),
    ShiftType("D", "Донорские", None, None, 0.0, False, False, 135),
    ShiftType("absence", "Прогул / Неявка", None, None, 0.0, False, False, 140),
    ShiftType("VK", "Военкомат", None, None, 0.0, False, False, 145),
    ShiftType("VS", "Военные сборы", None, None, 0.0, False, False, 150),
]


_VALID_CODES: Dict[str, ShiftType] = {st.code: st for st in SHIFT_TYPE_CATALOG}


def get_shift_type(code: Optional[str]) -> Optional[ShiftType]:
    if not code:
        return None
    return _VALID_CODES.get(code)


def validate_shift_type_code(code: Optional[str]) -> Optional[str]:
    """Возвращает код если он валиден, иначе None. None тоже допустим (пустая смена)."""
    if code is None or code == "":
        return None
    if code not in _VALID_CODES:
        raise ValueError(f"Неизвестный тип смены: {code!r}")
    return code
