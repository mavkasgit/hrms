"""seed admin user

Revision ID: 002_seed_admin
Revises: 001_initial
Create Date: 2026-04-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import bcrypt as bcrypt_lib


# revision identifiers, used by Alembic.
revision: str = '002_seed_admin'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    password_hash = bcrypt_lib.hashpw(
        "admin123".encode("utf-8"),
        bcrypt_lib.gensalt()
    ).decode("utf-8")
    conn.execute(
        sa.text(
            "INSERT INTO users (username, password_hash, role, full_name) "
            "VALUES (:username, :password_hash, :role, :full_name)"
        ),
        {
            "username": "admin",
            "password_hash": password_hash,
            "role": "admin",
            "full_name": "Администратор системы",
        },
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM users WHERE username = 'admin'"))
