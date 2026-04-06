"""Tests for vacation_repository"""
import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

from app.repositories.vacation_repository import VacationRepository


class TestCheckOverlap:
    """Проверка пересечений отпусков"""

    @pytest.fixture
    def repo(self):
        return VacationRepository()

    @pytest.fixture
    def mock_db(self):
        return AsyncMock()

    def _make_vacation(self, start, end, emp_id=1, vac_id=1):
        v = MagicMock()
        v.id = vac_id
        v.employee_id = emp_id
        v.start_date = start
        v.end_date = end
        return v

    @pytest.mark.asyncio
    async def test_no_overlap_same_employee(self, repo, mock_db):
        """Нет пересечений — другой диапазон"""
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

        result = await repo.check_overlap(mock_db, 1, date(2026, 5, 1), date(2026, 5, 10))
        assert result is None

    @pytest.mark.asyncio
    async def test_overlap_partial(self, repo, mock_db):
        """Частичное пересечение"""
        existing = self._make_vacation(date(2026, 4, 20), date(2026, 4, 30))
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=existing)))

        result = await repo.check_overlap(mock_db, 1, date(2026, 4, 25), date(2026, 5, 5))
        assert result is not None
        assert result.start_date == date(2026, 4, 20)

    @pytest.mark.asyncio
    async def test_overlap_fully_inside(self, repo, mock_db):
        """Новый отпуск полностью внутри существующего"""
        existing = self._make_vacation(date(2026, 4, 1), date(2026, 4, 30))
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=existing)))

        result = await repo.check_overlap(mock_db, 1, date(2026, 4, 10), date(2026, 4, 15))
        assert result is not None

    @pytest.mark.asyncio
    async def test_no_overlap_different_employee(self, repo, mock_db):
        """Разные сотрудники — нет пересечения"""
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

        result = await repo.check_overlap(mock_db, 2, date(2026, 4, 25), date(2026, 5, 5))
        assert result is None

    @pytest.mark.asyncio
    async def test_exclude_self_on_update(self, repo, mock_db):
        """При обновлении не должен пересекаться сам с собой"""
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

        result = await repo.check_overlap(mock_db, 1, date(2026, 4, 1), date(2026, 4, 10), exclude_id=5)
        assert result is None

    @pytest.mark.asyncio
    async def test_deleted_vacation_no_overlap(self, repo, mock_db):
        """Удалённый отпуск не должен конфликтовать"""
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

        result = await repo.check_overlap(mock_db, 1, date(2026, 4, 1), date(2026, 4, 10))
        assert result is None

    @pytest.mark.asyncio
    async def test_adjacent_dates_no_overlap(self, repo, mock_db):
        """Отпуски встык: конец одного = начало другого — это пересечение по SQL логике"""
        # SQL: start_date <= end_date AND end_date >= start_date
        # Если отпуск A: 1-10, отпуск B: 10-20 — они пересекаются (10 <= 10 AND 20 >= 1)
        existing = self._make_vacation(date(2026, 4, 1), date(2026, 4, 10))
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=existing)))

        result = await repo.check_overlap(mock_db, 1, date(2026, 4, 10), date(2026, 4, 20))
        assert result is not None


class TestGetUsedDays:
    """Подсчёт использованных дней"""

    @pytest.fixture
    def repo(self):
        return VacationRepository()

    @pytest.fixture
    def mock_db(self):
        return AsyncMock()

    @pytest.mark.asyncio
    async def test_no_vacations(self, repo, mock_db):
        mock_db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))))

        result = await repo.get_used_days(mock_db, 1, 2026)
        assert result == 0

    @pytest.mark.asyncio
    async def test_counts_calendar_days_not_working_days(self, repo, mock_db):
        """get_used_days считает календарные дни, а не рабочие — это важно для баланса"""
        vac = MagicMock()
        vac.start_date = date(2026, 4, 1)
        vac.end_date = date(2026, 4, 7)
        mock_db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[vac])))))

        result = await repo.get_used_days(mock_db, 1, 2026)
        # 7 дней календарных, не рабочих
        assert result == 7


class TestGetVacationBalance:
    """Баланс отпусков"""

    @pytest.fixture
    def repo(self):
        return VacationRepository()

    @pytest.fixture
    def mock_db(self):
        return AsyncMock()

    @pytest.mark.asyncio
    async def test_employee_not_found(self, repo, mock_db):
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

        result = await repo.get_vacation_balance(mock_db, 999, 2026)
        assert result["available_days"] == 0
        assert result["used_days"] == 0
        assert result["remaining_days"] == 0

    @pytest.mark.asyncio
    async def test_default_28_days(self, repo, mock_db):
        """По умолчанию 28 дней если нет override"""
        emp = MagicMock()
        emp.vacation_days_override = None
        mock_db.execute = AsyncMock(side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=emp)),
            MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
            MagicMock(all=MagicMock(return_value=[])),
        ])

        result = await repo.get_vacation_balance(mock_db, 1, 2026)
        assert result["available_days"] == 28

    @pytest.mark.asyncio
    async def test_override_zero(self, repo, mock_db):
        """override = 0 должно дать 0, а не 28"""
        emp = MagicMock()
        emp.vacation_days_override = 0
        mock_db.execute = AsyncMock(side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=emp)),
            MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
            MagicMock(all=MagicMock(return_value=[])),
        ])

        result = await repo.get_vacation_balance(mock_db, 1, 2026)
        assert result["available_days"] == 0

    @pytest.mark.asyncio
    async def test_override_value(self, repo, mock_db):
        emp = MagicMock()
        emp.vacation_days_override = 35
        mock_db.execute = AsyncMock(side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=emp)),
            MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
            MagicMock(all=MagicMock(return_value=[])),
        ])

        result = await repo.get_vacation_balance(mock_db, 1, 2026)
        assert result["available_days"] == 35
