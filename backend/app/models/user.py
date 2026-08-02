from enum import Enum

from sqlalchemy import (
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
            "ix_users_phone_active",
            "phone",
            unique=True,
            postgresql_where=text("is_deleted = false"),
        ),
        # Partial unique: soft-deleted rows do not block re-link of Authentik sub
        Index(
            "ix_users_authentik_sub_active",
            "authentik_sub",
            unique=True,
            postgresql_where=text("is_deleted = false AND authentik_sub IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    role = Column(String(50), nullable=False, default=UserRole.VIEWER.value)
    full_name = Column(String(255), nullable=False)

    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    employee = relationship("Employee")

    # Phone auth identity (uniqueness via partial index above)
    phone = Column(String(32), nullable=True, index=True)
    phone_verified_at = Column(DateTime(timezone=True), nullable=True)
    # Multiavatar seed: случайный при создании, далее — только явная смена в профиле.
    # NULL → на фронте пустая заглушка. До 64 ASCII (8 hex).
    avatar_seed = Column(String(64), nullable=True)
    # Unified profile cache (SoT = Authentik attributes)
    locale = Column(String(16), nullable=True)  # ru | en
    theme = Column(String(16), nullable=True)  # system | light | dark
    # Authentik / OIDC subject (stable UUID from IdP); link for SSO bridge
    authentik_sub = Column(String(255), nullable=True, index=True)
    profile_synced_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, server_default=text("true"))
    deleted_at = Column(DateTime(timezone=True))
    deleted_by = Column(String(100))

