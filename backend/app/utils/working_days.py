from datetime import date
from typing import Optional


def calculate_vacation_days(start_date: date, end_date: date, holidays_count: int = 0) -> int:
    """
    Считает дни отпуска: календарные дни минус праздники.
    
    Args:
        start_date: дата начала отпуска
        end_date: дата конца отпуска
        holidays_count: количество праздничных дней в этом диапазоне
    
    Returns:
        Количество дней отпуска (минимум 1 если start == end)
    """
    if end_date < start_date:
        return 0
    
    calendar_days = (end_date - start_date).days + 1
    return max(0, calendar_days - holidays_count)


def count_holidays_in_range(holidays: list[date], start_date: date, end_date: date) -> int:
    """
    Считает сколько праздников попадает в диапазон дат.
    
    Args:
        holidays: список дат праздников
        start_date: начало диапазона
        end_date: конец диапазона
    
    Returns:
        Количество праздников в диапазоне
    """
    return sum(1 for h in holidays if start_date <= h <= end_date)
