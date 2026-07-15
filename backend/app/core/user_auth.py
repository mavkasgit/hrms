"""Helpers for local password / invite onboarding state and avatar seed."""

from __future__ import annotations

import secrets

from app.core.constants import SSO_BYPASS_HASH
from app.models.user import User


def generate_avatar_seed() -> str:
    """Случайный seed Multiavatar: 8 hex-символов (4 байта), как на фронте."""
    return secrets.token_hex(4)


def has_local_password(user: User) -> bool:
    """True if user has a real (non-SSO-placeholder) local password."""
    pw = (user.password_hash or "").strip()
    return bool(pw) and pw != SSO_BYPASS_HASH


def clear_invite_if_fully_activated(user: User) -> bool:
    """
    Сбросить invite_code только когда заданы и пароль, и Telegram.

    Инвайт-код — маркер незавершённого онбординга: баннер в UI
    показывается, пока код есть и не выполнен любой из пунктов.
    """
    if has_local_password(user) and user.telegram_id is not None:
        if user.invite_code is not None:
            user.invite_code = None
            return True
    return False
