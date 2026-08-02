"""Helpers for user onboarding state and avatar seed."""

from __future__ import annotations

import secrets


def generate_avatar_seed() -> str:
    """Случайный seed Multiavatar: 8 hex-символов (4 байта), как на фронте."""
    return secrets.token_hex(4)
