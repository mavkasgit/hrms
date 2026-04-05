"""add vacation management: override, correction, order link, comment, cancellation, holidays

Revision ID: 003_vacation_management
Revises: 002_order_dates_local_time
Create Date: 2026-04-06
"""
from alembic import op
import sqlalchemy as sa

revision = "003_vacation_management"
down_revision = "002_order_dates_local_time"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Employees: vacation balance fields ---
    op.add_column("employees", sa.Column("vacation_days_override", sa.Integer(), nullable=True))
    op.add_column("employees", sa.Column("vacation_days_correction", sa.Integer(), nullable=True))

    # --- Vacations: extra fields and cancellation ---
    op.add_column("vacations", sa.Column("comment", sa.String(500), nullable=True))
    op.add_column("vacations", sa.Column("order_id", sa.Integer(), nullable=True))
    op.add_column("vacations", sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("vacations", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("vacations", sa.Column("cancelled_by", sa.String(100), nullable=True))
    op.create_foreign_key("fk_vacations_order_id", "vacations", "orders", ["order_id"], ["id"])
    op.create_index(op.f("ix_vacations_is_cancelled"), "vacations", ["is_cancelled"])

    # --- Orders: cancellation fields ---
    op.add_column("orders", sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("orders", sa.Column("cancelled_at", sa.DateTime(), nullable=True))
    op.add_column("orders", sa.Column("cancelled_by", sa.String(100), nullable=True))
    op.create_index(op.f("ix_orders_is_cancelled"), "orders", ["is_cancelled"])

    # --- Holidays: production calendar ---
    op.create_table(
        "holidays",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_holidays_date", "holidays", ["date"], unique=True)
    op.create_index("ix_holidays_year", "holidays", ["year"])

    # Seed default holidays for 2026
    from datetime import date
    holidays = [
        (date(2026, 1, 1), "Новый год", 2026),
        (date(2026, 1, 2), "Новый год", 2026),
        (date(2026, 1, 7), "Рождество Христово (православное)", 2026),
        (date(2026, 3, 8), "День женщин", 2026),
        (date(2026, 5, 1), "Праздник труда", 2026),
        (date(2026, 5, 9), "День Победы", 2026),
        (date(2026, 7, 3), "День Независимости", 2026),
        (date(2026, 11, 7), "День Октябрьской революции", 2026),
        (date(2026, 12, 25), "Рождество Христово (католическое)", 2026),
    ]
    op.bulk_insert(
        sa.table("holidays",
            sa.column("date", sa.Date()),
            sa.column("name", sa.String()),
            sa.column("year", sa.Integer()),
        ),
        [{"date": d, "name": n, "year": y} for d, n, y in holidays],
    )


def downgrade() -> None:
    # Drop holidays
    op.drop_index("ix_holidays_year", table_name="holidays")
    op.drop_index("ix_holidays_date", table_name="holidays")
    op.drop_table("holidays")

    # Drop orders cancellation
    op.drop_index(op.f("ix_orders_is_cancelled"), table_name="orders")
    op.drop_column("orders", "cancelled_by")
    op.drop_column("orders", "cancelled_at")
    op.drop_column("orders", "is_cancelled")

    # Drop vacations extras
    op.drop_constraint("fk_vacations_order_id", "vacations", type_="foreignkey")
    op.drop_index(op.f("ix_vacations_is_cancelled"), table_name="vacations")
    op.drop_column("vacations", "cancelled_by")
    op.drop_column("vacations", "cancelled_at")
    op.drop_column("vacations", "is_cancelled")
    op.drop_column("vacations", "order_id")
    op.drop_column("vacations", "comment")

    # Drop employees vacation fields
    op.drop_column("employees", "vacation_days_correction")
    op.drop_column("employees", "vacation_days_override")
