"""Tests for working_days utility"""
from datetime import date
import pytest

from app.utils.working_days import calculate_vacation_days, count_holidays_in_range


class TestCalculateVacationDays:
    def test_single_day_no_holidays(self):
        """Один день отпуска, без праздников"""
        result = calculate_vacation_days(date(2026, 4, 1), date(2026, 4, 1), 0)
        assert result == 1

    def test_single_day_is_holiday(self):
        """Один день отпуска, этот день — праздник"""
        result = calculate_vacation_days(date(2026, 1, 1), date(2026, 1, 1), 1)
        assert result == 0

    def test_week_no_holidays(self):
        """Неделя без праздников"""
        result = calculate_vacation_days(date(2026, 4, 1), date(2026, 4, 7), 0)
        assert result == 7

    def test_week_with_holidays(self):
        """Неделя с 2 праздниками"""
        result = calculate_vacation_days(date(2026, 4, 1), date(2026, 4, 7), 2)
        assert result == 5

    def test_all_days_are_holidays(self):
        """Все дни — праздники"""
        result = calculate_vacation_days(date(2026, 1, 1), date(2026, 1, 2), 2)
        assert result == 0

    def test_end_before_start(self):
        """Дата конца раньше начала"""
        result = calculate_vacation_days(date(2026, 4, 10), date(2026, 4, 1), 0)
        assert result == 0

    def test_more_holidays_than_days(self):
        """Праздников больше чем дней в диапазоне"""
        result = calculate_vacation_days(date(2026, 4, 1), date(2026, 4, 3), 10)
        assert result == 0

    def test_negative_holidays_count(self):
        """Отрицательное количество праздников (не должно случаться, но функция должна выжить)"""
        result = calculate_vacation_days(date(2026, 4, 1), date(2026, 4, 3), -1)
        assert result == 4


class TestCountHolidaysInRange:
    def test_no_holidays(self):
        holidays = []
        result = count_holidays_in_range(holidays, date(2026, 1, 1), date(2026, 12, 31))
        assert result == 0

    def test_all_in_range(self):
        holidays = [date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 7)]
        result = count_holidays_in_range(holidays, date(2026, 1, 1), date(2026, 1, 7))
        assert result == 3

    def test_partial_overlap(self):
        holidays = [date(2026, 1, 1), date(2026, 3, 8), date(2026, 7, 3)]
        result = count_holidays_in_range(holidays, date(2026, 1, 15), date(2026, 6, 1))
        assert result == 1

    def test_boundary_inclusive(self):
        """Границы диапазона включительны"""
        holidays = [date(2026, 1, 1), date(2026, 12, 25)]
        result = count_holidays_in_range(holidays, date(2026, 1, 1), date(2026, 1, 1))
        assert result == 1

    def test_holiday_before_range(self):
        holidays = [date(2025, 12, 25)]
        result = count_holidays_in_range(holidays, date(2026, 1, 1), date(2026, 1, 31))
        assert result == 0

    def test_holiday_after_range(self):
        holidays = [date(2026, 12, 25)]
        result = count_holidays_in_range(holidays, date(2026, 1, 1), date(2026, 1, 31))
        assert result == 0

    def test_new_year_cross_year(self):
        """Праздники через год"""
        holidays = [date(2025, 12, 25), date(2026, 1, 1), date(2026, 1, 2)]
        result = count_holidays_in_range(holidays, date(2025, 12, 28), date(2026, 1, 5))
        assert result == 2
