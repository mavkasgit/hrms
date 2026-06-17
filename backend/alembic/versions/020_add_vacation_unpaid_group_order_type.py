"""add vacation_unpaid_group order type

Revision ID: 020
Revises: 019
Create Date: 2026-05-12 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO order_types (code, name, show_in_orders_page, template_filename, field_schema)
            VALUES (
                :code,
                :name,
                :show_in_orders_page,
                :template_filename,
                cast(:field_schema as json)
            )
            ON CONFLICT (code) DO NOTHING
            """
        ).bindparams(
            code="vacation_unpaid_group",
            name="Отпуск за свой счет (групповой)",
            show_in_orders_page=False,
            template_filename="template__order__vacation_unpaid_group.docx",
            field_schema='[{"key":"vacation_start","label":"Дата начала","type":"date","required":true}]',
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM order_types WHERE code = :code").bindparams(code="vacation_unpaid_group")
    )
