from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
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
        # Partial unique: soft-deleted rows do not block re-link of Authentik sub
        Index(
            "ix_users_authentik_sub_active",
            "authentik_sub",
            unique=True,
            postgresql_where=text("is_deleted = false AND authentik_sub IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default=UserRole.VIEWER.value)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)

    employee_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("employees.id"), nullable=True)
    employee = relationship("Employee")

    # Multiavatar seed: случайный при создании, далее — только явная смена в профиле.
    # NULL → на фронте пустая заглушка. До 64 ASCII (8 hex).
    avatar_seed: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Unified profile cache (SoT = Authentik attributes)
    locale: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # ru | en
    theme: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # system | light | dark
    # Authentik / OIDC subject (stable UUID from IdP); link for SSO bridge
    authentik_sub: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    profile_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default=text("true"))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[Optional[str]] = mapped_column(String(100))

