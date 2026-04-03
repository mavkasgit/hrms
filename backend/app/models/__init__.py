from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import all models so Alembic can discover them
from app.models.employee import Employee  # noqa: F401, E402
from app.models.order import Order, OrderSequence  # noqa: F401, E402
from app.models.vacation import Vacation  # noqa: F401, E402
from app.models.reference import Reference  # noqa: F401, E402
from app.models.user import User, UserRole  # noqa: F401, E402
