from enum import Enum

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

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
        # Partial unique: soft-deleted rows do not block re-link / JIT (M3).
        Index(
            "ix_users_telegram_id_active",
            "telegram_id",
            unique=True,
            postgresql_where=text("is_deleted = false"),
        ),
        Index(
            "ix_users_phone_active",
            "phone",
            unique=True,
            postgresql_where=text("is_deleted = false"),
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    # Когда пользователь последний раз задал/сменил локальный пароль (NULL = пароль не задан).
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    role = Column(String(50), nullable=False, default=UserRole.VIEWER.value)
    full_name = Column(String(255), nullable=False)

    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    employee = relationship("Employee")

    # Telegram / phone auth identity (uniqueness via partial indexes above)
    telegram_id = Column(BigInteger, nullable=True, index=True)
    telegram_username = Column(String(100), nullable=True)
    phone = Column(String(32), nullable=True, index=True)
    phone_verified_at = Column(DateTime(timezone=True), nullable=True)
    # Multiavatar seed: случайный при создании, далее — только явная смена в профиле.
    # NULL → на фронте пустая заглушка. До 64 ASCII (8 hex).
    avatar_seed = Column(String(64), nullable=True)
    invite_code = Column(String(64), unique=True, nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime(timezone=True))
    deleted_by = Column(String(100))

