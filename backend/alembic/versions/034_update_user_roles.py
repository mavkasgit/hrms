"""update_user_roles

Revision ID: 034
Revises: 033
Create Date: 2026-06-17 00:38:31.651564

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '034'
down_revision: Union[str, None] = '033'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Переводим всех пользователей со старыми ролями в 'viewer'
    op.execute("UPDATE users SET role = 'viewer' WHERE role IN ('hr_manager', 'hr_specialist')")
    
    # 2. Удаляем старое ограничение
    op.drop_constraint('ck_users_role', 'users', type_='check')
    
    # 3. Добавляем новое ограничение
    op.create_check_constraint('ck_users_role', 'users', "role IN ('admin', 'viewer')")


def downgrade() -> None:
    # 1. Удаляем новое ограничение
    op.drop_constraint('ck_users_role', 'users', type_='check')
    
    # 2. Добавляем старое ограничение
    op.create_check_constraint('ck_users_role', 'users', "role IN ('admin', 'hr_manager', 'hr_specialist')")
