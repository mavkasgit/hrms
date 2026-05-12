"""add vacation_unpaid_group order type

Revision ID: 20260512_0100
Revises:
Create Date: 2026-05-12 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260512_0100"
down_revision = None  # update as needed
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO order_types (code, name, show_in_orders_page, template_filename, field_schema)
            VALUES (
                'vacation_unpaid_group',
                'Отпуск за свой счет (групповой)',
                false,
                'template__order__vacation_unpaid_group.docx',
                '[{"key":"vacation_start","label":"Дата начала","type":"date","required":true}]'::json
            )
            ON CONFLICT (code) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM order_types WHERE code = 'vacation_unpaid_group'"))
