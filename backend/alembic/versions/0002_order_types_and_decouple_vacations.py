"""order types

Revision ID: 0002_order_types
Revises: 0001_initial_schema
Create Date: 2026-04-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_order_types"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "order_types",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("show_in_orders_page", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("template_filename", sa.String(length=255), nullable=True),
        sa.Column("field_schema", postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("filename_pattern", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_order_types_code", "order_types", ["code"], unique=True)
    op.create_index("ix_order_types_is_active", "order_types", ["is_active"], unique=False)

    default_types = [
        (
            "hire",
            "Прием на работу",
            True,
            "prikaz_priem.docx",
            '[{"key":"hire_date","label":"Дата приема","type":"date","required":false},{"key":"contract_end","label":"Конец контракта","type":"date","required":false},{"key":"trial_end","label":"Конец испытательного срока","type":"date","required":false}]',
        ),
        (
            "dismissal",
            "Увольнение",
            True,
            "prikaz_uvolnenie.docx",
            '[{"key":"dismissal_date","label":"Дата увольнения","type":"date","required":false}]',
        ),
        (
            "transfer",
            "Перевод",
            True,
            "prikaz_perevod.docx",
            '[{"key":"transfer_date","label":"Дата перевода","type":"date","required":false},{"key":"transfer_reason","label":"Основание","type":"textarea","required":false}]',
        ),
        (
            "contract_extension",
            "Продление контракта",
            True,
            "prikaz_prodlenie_kontrakta.docx",
            '[{"key":"contract_new_end","label":"Новая дата конца контракта","type":"date","required":false},{"key":"trial_end","label":"Конец испытательного срока","type":"date","required":false}]',
        ),
        (
            "vacation_paid",
            "Отпуск трудовой",
            False,
            "prikaz_otpusk_trudovoy.docx",
            '[{"key":"vacation_start","label":"Дата начала","type":"date","required":true},{"key":"vacation_end","label":"Дата окончания","type":"date","required":true},{"key":"vacation_days","label":"Количество дней","type":"number","required":true}]',
        ),
        (
            "vacation_unpaid",
            "Отпуск за свой счет",
            False,
            "prikaz_otpusk_svoy_schet.docx",
            '[{"key":"vacation_start","label":"Дата начала","type":"date","required":true},{"key":"vacation_end","label":"Дата окончания","type":"date","required":true},{"key":"vacation_days","label":"Количество дней","type":"number","required":true}]',
        ),
    ]

    for code, name, show_in_orders_page, template_filename, field_schema in default_types:
        op.execute(
            sa.text(
                """
                INSERT INTO order_types (code, name, show_in_orders_page, template_filename, field_schema)
                VALUES (:code, :name, :show_in_orders_page, :template_filename, CAST(:field_schema AS json))
                """
            ).bindparams(
                code=code,
                name=name,
                show_in_orders_page=show_in_orders_page,
                template_filename=template_filename,
                field_schema=field_schema,
            )
        )

    op.add_column("orders", sa.Column("order_type_id", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("extra_fields", postgresql.JSON(astext_type=sa.Text()), nullable=True))

    op.execute(
        """
        UPDATE orders
        SET order_type_id = ot.id
        FROM order_types ot
        WHERE (
            (orders.order_type = 'Прием на работу' AND ot.code = 'hire') OR
            (orders.order_type = 'Увольнение' AND ot.code = 'dismissal') OR
            (orders.order_type = 'Перевод' AND ot.code = 'transfer') OR
            (orders.order_type = 'Продление контракта' AND ot.code = 'contract_extension') OR
            (orders.order_type = 'Отпуск трудовой' AND ot.code = 'vacation_paid') OR
            (orders.order_type = 'Отпуск за свой счет' AND ot.code = 'vacation_unpaid')
        )
        """
    )

    fallback_type_id = op.get_bind().execute(sa.text("SELECT id FROM order_types ORDER BY id LIMIT 1")).scalar()
    if fallback_type_id is not None:
        op.execute(sa.text("UPDATE orders SET order_type_id = :type_id WHERE order_type_id IS NULL").bindparams(type_id=fallback_type_id))

    op.alter_column("orders", "order_type_id", nullable=False)
    op.create_foreign_key("fk_orders_order_type_id", "orders", "order_types", ["order_type_id"], ["id"])
    op.create_index("ix_orders_order_type_id", "orders", ["order_type_id"], unique=False)
    op.drop_column("orders", "order_type")


def downgrade() -> None:
    op.add_column("orders", sa.Column("order_type", sa.String(length=50), nullable=True))
    op.execute(
        """
        UPDATE orders
        SET order_type = COALESCE(ot.name, 'Приказ')
        FROM order_types ot
        WHERE orders.order_type_id = ot.id
        """
    )
    op.alter_column("orders", "order_type", nullable=False)

    op.drop_index("ix_orders_order_type_id", table_name="orders")
    op.drop_constraint("fk_orders_order_type_id", "orders", type_="foreignkey")
    op.drop_column("orders", "extra_fields")
    op.drop_column("orders", "order_type_id")

    op.drop_index("ix_order_types_is_active", table_name="order_types")
    op.drop_index("ix_order_types_code", table_name="order_types")
    op.drop_table("order_types")
