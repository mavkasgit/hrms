"""Tests for vacation_service — all non-obvious edge cases"""
import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.vacation_service import VacationService
from app.core.exceptions import (
    EmployeeNotFoundError,
    VacationOverlapError,
    InsufficientVacationDaysError,
    VacationNotFoundError,
)


class TestCreateVacation:
    @pytest.fixture
    def service(self):
        return VacationService()

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.in_transaction = MagicMock(return_value=False)
        return db

    def _make_employee(self, emp_id=1, name="Test Employee", override=None):
        emp = MagicMock()
        emp.id = emp_id
        emp.name = name
        emp.vacation_days_override = override
        return emp

    def _make_vacation(self, vac_id=1, emp_id=1, start=date(2026, 4, 1), end=date(2026, 4, 10), vtype="Трудовой", days=10):
        v = MagicMock()
        v.id = vac_id
        v.employee_id = emp_id
        v.start_date = start
        v.end_date = end
        v.vacation_type = vtype
        v.days_count = days
        v.comment = None
        v.created_at = "2026-04-01T00:00:00"
        return v

    def _make_order(self, order_id=1, number="01"):
        o = MagicMock()
        o.id = order_id
        o.order_number = number
        return o

    @pytest.mark.asyncio
    async def test_employee_not_found(self, service, mock_db):
        with patch("app.services.vacation_service.EmployeeRepository") as MockEmpRepo:
            emp_repo = AsyncMock()
            emp_repo.get_by_id = AsyncMock(return_value=None)
            MockEmpRepo.return_value = emp_repo

            with pytest.raises(EmployeeNotFoundError):
                await service.create_vacation(mock_db, {
                    "employee_id": 999,
                    "start_date": date(2026, 4, 1),
                    "end_date": date(2026, 4, 10),
                    "vacation_type": "Трудовой",
                }, "admin")

    @pytest.mark.asyncio
    async def test_end_before_start(self, service, mock_db):
        emp = self._make_employee()
        with patch("app.services.vacation_service.EmployeeRepository") as MockEmpRepo:
            MockEmpRepo.return_value.get_by_id = AsyncMock(return_value=emp)

            with pytest.raises(InsufficientVacationDaysError) as exc_info:
                await service.create_vacation(mock_db, {
                    "employee_id": 1,
                    "start_date": date(2026, 4, 10),
                    "end_date": date(2026, 4, 1),
                    "vacation_type": "Трудовой",
                }, "admin")
            assert "раньше" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_overlap_error(self, service, mock_db):
        emp = self._make_employee()
        existing_vac = self._make_vacation(start=date(2026, 4, 5), end=date(2026, 4, 15))

        with patch("app.services.vacation_service.EmployeeRepository") as MockEmpRepo:
            MockEmpRepo.return_value.get_by_id = AsyncMock(return_value=emp)

            with patch("app.services.vacation_service.vacation_repository") as mock_vac_repo:
                mock_vac_repo.check_overlap = AsyncMock(return_value=existing_vac)
                mock_vac_repo.get_vacation_balance = AsyncMock(return_value={"remaining_days": 28})

                with pytest.raises(VacationOverlapError):
                    await service.create_vacation(mock_db, {
                        "employee_id": 1,
                        "start_date": date(2026, 4, 1),
                        "end_date": date(2026, 4, 10),
                        "vacation_type": "Трудовой",
                    }, "admin")

    @pytest.mark.asyncio
    async def test_insufficient_days(self, service, mock_db):
        emp = self._make_employee()

        with patch("app.services.vacation_service.EmployeeRepository") as MockEmpRepo:
            MockEmpRepo.return_value.get_by_id = AsyncMock(return_value=emp)

            with patch("app.services.vacation_service.vacation_repository") as mock_vac_repo:
                mock_vac_repo.check_overlap = AsyncMock(return_value=None)
                mock_vac_repo.get_vacation_balance = AsyncMock(return_value={
                    "available_days": 28,
                    "used_days": 26,
                    "remaining_days": 2,
                    "vacation_type_breakdown": {"Трудовой": 26},
                })

                with patch("app.services.vacation_service.references_repository") as mock_ref_repo:
                    mock_ref_repo.get_holidays_for_year = AsyncMock(return_value=[])

                    with patch("app.services.vacation_service.vacation_period_service") as mock_vp:
                        mock_vp.check_balance_before_create = AsyncMock(side_effect=InsufficientVacationDaysError("Недостаточно дней отпуска"))

                        with pytest.raises(InsufficientVacationDaysError) as exc_info:
                            await service.create_vacation(mock_db, {
                                "employee_id": 1,
                                "start_date": date(2026, 4, 1),
                                "end_date": date(2026, 4, 10),
                                "vacation_type": "Трудовой",
                            }, "admin")
                        assert "Недостаточно" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_no_balance_check_for_unpaid(self, service, mock_db):
        emp = self._make_employee()

        with patch("app.services.vacation_service.EmployeeRepository") as MockEmpRepo:
            MockEmpRepo.return_value.get_by_id = AsyncMock(return_value=emp)

            with patch("app.services.vacation_service.vacation_repository") as mock_vac_repo:
                mock_vac_repo.check_overlap = AsyncMock(return_value=None)
                mock_vac_repo.create = AsyncMock(return_value=self._make_vacation(vtype="За свой счет", days=5))

                with patch("app.services.vacation_service.references_repository") as mock_ref_repo:
                    mock_ref_repo.get_holidays_for_year = AsyncMock(return_value=[])

                with patch("app.services.vacation_service.vacation_period_service") as mock_vp:
                    mock_vp.check_balance_before_create = AsyncMock(return_value=None)

                    with patch("app.services.vacation_service.order_service") as mock_order_svc:
                        mock_order_svc.create_order = AsyncMock(return_value=self._make_order())

                        result = await service.create_vacation(mock_db, {
                            "employee_id": 1,
                            "start_date": date(2026, 4, 1),
                            "end_date": date(2026, 4, 5),
                            "vacation_type": "За свой счет",
                        }, "admin")

                        mock_vac_repo.get_vacation_balance.assert_not_called()
                        assert result is not None

    @pytest.mark.asyncio
    async def test_zero_days_error(self, service, mock_db):
        emp = self._make_employee()

        with patch("app.services.vacation_service.EmployeeRepository") as MockEmpRepo:
            MockEmpRepo.return_value.get_by_id = AsyncMock(return_value=emp)

            with patch("app.services.vacation_service.vacation_repository") as mock_vac_repo:
                mock_vac_repo.check_overlap = AsyncMock(return_value=None)
                mock_vac_repo.get_vacation_balance = AsyncMock(return_value={"remaining_days": 28})

                with patch("app.services.vacation_service.references_repository") as mock_ref_repo:
                    mock_ref_repo.get_holidays_for_year = AsyncMock(return_value=[
                        date(2026, 1, 1), date(2026, 1, 2)
                    ])

                    with pytest.raises(InsufficientVacationDaysError) as exc_info:
                        await service.create_vacation(mock_db, {
                            "employee_id": 1,
                            "start_date": date(2026, 1, 1),
                            "end_date": date(2026, 1, 2),
                            "vacation_type": "Трудовой",
                        }, "admin")
                    assert "Нет дней" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_order_date_from_data(self, service, mock_db):
        emp = self._make_employee()

        with patch("app.services.vacation_service.EmployeeRepository") as MockEmpRepo:
            MockEmpRepo.return_value.get_by_id = AsyncMock(return_value=emp)

            with patch("app.services.vacation_service.vacation_repository") as mock_vac_repo:
                mock_vac_repo.check_overlap = AsyncMock(return_value=None)
                mock_vac_repo.get_vacation_balance = AsyncMock(return_value={"remaining_days": 28})
                mock_vac_repo.create = AsyncMock(return_value=self._make_vacation())

                with patch("app.services.vacation_service.references_repository") as mock_ref_repo:
                    mock_ref_repo.get_holidays_for_year = AsyncMock(return_value=[])

                    with patch("app.services.vacation_service.vacation_period_service") as mock_vp:
                        mock_vp.check_balance_before_create = AsyncMock(return_value=None)

                        with patch("app.services.vacation_service.order_service") as mock_order_svc:
                            mock_order_svc.create_order = AsyncMock(return_value=self._make_order())

                            await service.create_vacation(mock_db, {
                                "employee_id": 1,
                                "start_date": date(2026, 4, 1),
                                "end_date": date(2026, 4, 10),
                                "vacation_type": "Трудовой",
                                "order_date": date(2026, 3, 15),
                            }, "admin")

                            call_data = mock_order_svc.create_order.call_args[0][1]
                            assert call_data.order_date == date(2026, 3, 15)

    @pytest.mark.asyncio
    async def test_order_date_defaults_to_today(self, service, mock_db):
        emp = self._make_employee()

        with patch("app.services.vacation_service.EmployeeRepository") as MockEmpRepo:
            MockEmpRepo.return_value.get_by_id = AsyncMock(return_value=emp)

            with patch("app.services.vacation_service.vacation_repository") as mock_vac_repo:
                mock_vac_repo.check_overlap = AsyncMock(return_value=None)
                mock_vac_repo.get_vacation_balance = AsyncMock(return_value={"remaining_days": 28})
                mock_vac_repo.create = AsyncMock(return_value=self._make_vacation())

                with patch("app.services.vacation_service.references_repository") as mock_ref_repo:
                    mock_ref_repo.get_holidays_for_year = AsyncMock(return_value=[])

                    with patch("app.services.vacation_service.vacation_period_service") as mock_vp:
                        mock_vp.check_balance_before_create = AsyncMock(return_value=None)

                        with patch("app.services.vacation_service.order_service") as mock_order_svc:
                            mock_order_svc.create_order = AsyncMock(return_value=self._make_order())

                            await service.create_vacation(mock_db, {
                                "employee_id": 1,
                                "start_date": date(2026, 4, 1),
                                "end_date": date(2026, 4, 10),
                                "vacation_type": "Трудовой",
                            }, "admin")

                            call_data = mock_order_svc.create_order.call_args[0][1]
                            assert call_data.order_date == date.today()

    @pytest.mark.asyncio
    async def test_commit_called_once(self, service, mock_db):
        emp = self._make_employee()

        with patch("app.services.vacation_service.EmployeeRepository") as MockEmpRepo:
            MockEmpRepo.return_value.get_by_id = AsyncMock(return_value=emp)

            with patch("app.services.vacation_service.vacation_repository") as mock_vac_repo:
                mock_vac_repo.check_overlap = AsyncMock(return_value=None)
                mock_vac_repo.get_vacation_balance = AsyncMock(return_value={"remaining_days": 28})
                mock_vac_repo.create = AsyncMock(return_value=self._make_vacation())

                with patch("app.services.vacation_service.references_repository") as mock_ref_repo:
                    mock_ref_repo.get_holidays_for_year = AsyncMock(return_value=[])

                    with patch("app.services.vacation_service.vacation_period_service") as mock_vp:
                        mock_vp.check_balance_before_create = AsyncMock(return_value=None)

                        with patch("app.services.vacation_service.order_service") as mock_order_svc:
                            mock_order_svc.create_order = AsyncMock(return_value=self._make_order())

                            await service.create_vacation(mock_db, {
                                "employee_id": 1,
                                "start_date": date(2026, 4, 1),
                                "end_date": date(2026, 4, 10),
                                "vacation_type": "Трудовой",
                            }, "admin")

                            mock_db.commit.assert_called_once()


class TestUpdateVacation:
    @pytest.fixture
    def service(self):
        return VacationService()

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.in_transaction = MagicMock(return_value=False)
        return db

    def _make_vacation(self, vac_id=1, emp_id=1, start=date(2026, 4, 1), end=date(2026, 4, 10), vtype="Трудовой", days=10):
        v = MagicMock()
        v.id = vac_id
        v.employee_id = emp_id
        v.start_date = start
        v.end_date = end
        v.vacation_type = vtype
        v.days_count = days
        v.comment = None
        v.created_at = "2026-04-01T00:00:00"
        return v

    def _make_employee(self, emp_id=1, name="Test Employee", override=None):
        emp = MagicMock()
        emp.id = emp_id
        emp.name = name
        emp.vacation_days_override = override
        return emp

    @pytest.mark.asyncio
    async def test_not_found(self, service, mock_db):
        with patch("app.services.vacation_service.vacation_repository") as mock_repo:
            mock_repo.get_by_id = AsyncMock(return_value=None)

            with pytest.raises(VacationNotFoundError):
                await service.update_vacation(mock_db, 999, {}, "admin")

    @pytest.mark.asyncio
    async def test_end_before_start(self, service, mock_db):
        existing = self._make_vacation()
        with patch("app.services.vacation_service.vacation_repository") as mock_repo:
            mock_repo.get_by_id = AsyncMock(return_value=existing)

            with pytest.raises(InsufficientVacationDaysError):
                await service.update_vacation(mock_db, 1, {
                    "start_date": date(2026, 4, 15),
                    "end_date": date(2026, 4, 1),
                }, "admin")

    @pytest.mark.asyncio
    async def test_overlap_with_another_vacation(self, service, mock_db):
        existing = self._make_vacation(vac_id=1, emp_id=1)
        overlapping = self._make_vacation(vac_id=2, emp_id=1, start=date(2026, 4, 5), end=date(2026, 4, 15))

        with patch("app.services.vacation_service.vacation_repository") as mock_repo:
            mock_repo.get_by_id = AsyncMock(return_value=existing)
            mock_repo.check_overlap = AsyncMock(return_value=overlapping)

            with pytest.raises(VacationOverlapError):
                await service.update_vacation(mock_db, 1, {
                    "start_date": date(2026, 4, 5),
                    "end_date": date(2026, 4, 20),
                }, "admin")

    @pytest.mark.asyncio
    async def test_recalculates_days(self, service, mock_db):
        existing = self._make_vacation()
        updated = self._make_vacation(start=date(2026, 5, 1), end=date(2026, 5, 5), days=5)
        emp = self._make_employee()

        with patch("app.services.vacation_service.vacation_repository") as mock_repo:
            mock_repo.get_by_id = AsyncMock(return_value=existing)
            mock_repo.check_overlap = AsyncMock(return_value=None)
            mock_repo.update = AsyncMock(return_value=updated)

            with patch("app.services.vacation_service.EmployeeRepository") as MockEmpRepo:
                MockEmpRepo.return_value.get_by_id = AsyncMock(return_value=emp)

                with patch("app.services.vacation_service.references_repository") as mock_ref:
                    mock_ref.get_holidays_for_year = AsyncMock(return_value=[])

                    result = await service.update_vacation(mock_db, 1, {
                        "start_date": date(2026, 5, 1),
                        "end_date": date(2026, 5, 5),
                    }, "admin")

                    assert result["days_count"] == 5


class TestDeleteVacation:
    @pytest.fixture
    def service(self):
        return VacationService()

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.in_transaction = MagicMock(return_value=False)
        return db

    @pytest.mark.asyncio
    async def test_not_found(self, service, mock_db):
        with patch("app.services.vacation_service.vacation_repository") as mock_repo:
            mock_repo.get_by_id = AsyncMock(return_value=None)

            with pytest.raises(VacationNotFoundError):
                await service.delete_vacation(mock_db, 999, "admin")

    @pytest.mark.asyncio
    async def test_soft_delete(self, service, mock_db):
        vac = MagicMock()
        vac.is_cancelled = False
        with patch("app.services.vacation_service.vacation_repository") as mock_repo:
            mock_repo.get_by_id = AsyncMock(return_value=vac)
            mock_repo.soft_delete = AsyncMock(return_value=True)

            result = await service.delete_vacation(mock_db, 1, "admin")
            assert result is True
            mock_repo.soft_delete.assert_called_once_with(mock_db, 1, "admin")
