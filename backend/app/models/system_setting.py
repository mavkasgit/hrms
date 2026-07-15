"""Системные настройки (key-value) с возможностью редактирования через UI.

Используется для секретов и feature-флагов, которые админ должен мочь менять
без перезапуска и без выкатки новой версии приложения. Первое применение —
токен Telegram-бота. Чувствительные ключи маскируются на чтении (см. admin_settings_api).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    # Стабильный строковый ключ. Известные ключи живут в admin_settings.KNOWN_KEYS.
    key: Mapped[str] = mapped_column(String(100), primary_key=True)

    # Значение как plain text. Для секретов — см. маскирование в API.
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:
        return f"<SystemSetting(key='{self.key}', has_value={bool(self.value)})>"
