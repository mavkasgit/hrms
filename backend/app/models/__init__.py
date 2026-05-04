from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import all models so Alembic can discover them
from app.models.employee import Employee, EmployeeAuditLog  # noqa: F401, E402
from app.models.order import Order, OrderSequence  # noqa: F401, E402
from app.models.order_type import OrderType  # noqa: F401, E402
from app.models.vacation import Vacation  # noqa: F401, E402
from app.models.vacation_period import VacationPeriod  # noqa: F401, E402
from app.models.vacation_plan import VacationPlan  # noqa: F401, E402
from app.models.reference import Reference  # noqa: F401, E402
from app.models.references import PositionVacationConfig, Holiday  # noqa: F401, E402
from app.models.user import User, UserRole  # noqa: F401, E402
from app.models.department import Department, DepartmentRelation, RelationType  # noqa: F401, E402
from app.models.tag import Tag, EmployeeTag, DepartmentTag  # noqa: F401, E402
from app.models.position import Position  # noqa: F401, E402
from app.models.sick_leave import SickLeave, SickLeaveStatus  # noqa: F401, E402
from app.models.vacation_period_transaction import VacationPeriodTransaction  # noqa: F401, E402
from app.models.hire_date_adjustment import HireDateAdjustment  # noqa: F401, E402
from app.models.document import Document  # noqa: F401, E402
