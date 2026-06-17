"""add_substitution_order_type

Revision ID: 011
Revises: 010
Create Date: 2026-05-06

"""
from typing import Union, Optional

import sqlalchemy as sa
from alembic import op

revision: str = '011'
down_revision: Union[str, None] = '010'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO order_types (code, name, is_active, show_in_orders_page, letter, field_schema, template_filename, filename_pattern)
            VALUES ('substitution', 'О выполнении обязанностей', true, true, 'к', '[]', 'prikaz_vypolnenie_obyazannostey.docx', 'Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx')
            """
        )
    )


def downgrade() -> None:
    op.execute("DELETE FROM order_types WHERE code = 'substitution';")
