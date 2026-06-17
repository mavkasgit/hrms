from enum import Enum

from sqlalchemy import Column, Integer, String, DateTime, CheckConstraint, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class UserRole(str, Enum):
    ADMIN = "admin"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('admin', 'viewer')",
            name="ck_users_role",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default=UserRole.VIEWER.value)
    full_name = Column(String(255), nullable=False)
    
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    employee = relationship("Employee")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime(timezone=True))
    deleted_by = Column(String(100))

