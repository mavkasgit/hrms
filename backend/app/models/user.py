from enum import Enum

from sqlalchemy import Column, Integer, String, DateTime, CheckConstraint, Boolean
from sqlalchemy.sql import func

from app.models.base import Base


class UserRole(str, Enum):
    ADMIN = "admin"
    HR_MANAGER = "hr_manager"
    HR_SPECIALIST = "hr_specialist"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('admin', 'hr_manager', 'hr_specialist')",
            name="ck_users_role",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default=UserRole.HR_SPECIALIST.value)
    full_name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime(timezone=True))
    deleted_by = Column(String(100))
