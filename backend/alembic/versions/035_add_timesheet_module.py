"""add timesheet module: work_schedules, work_schedule_entries, timesheet_imports, timesheet_entries, timesheet_unmatched_rows

Тип смены — это фиксированный enum (см. app.core.shift_types), не таблица.
work_schedule_entries.shift_type_code: VARCHAR(20), валидируется в коде.
Это убирает необходимость в сидинге, миграциях при добавлении типа и хранении
UI-метаданных (иконка, цвет) в БД.

Revision ID: 035
Revises: 034
Create Date: 2026-07-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Плановый график работы сотрудника на месяц
    op.create_table(
        "work_schedules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("year", sa.Integer(), nullable=False, index=True),
        sa.Column("month", sa.Integer(), nullable=False, index=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("approved_by", sa.String(length=100), nullable=True),
        sa.Column("approved_at", sa.Date(), nullable=True),
        sa.Column("created_at", sa.Date(), nullable=False, server_default=sa.func.current_date()),
        sa.Column("created_by", sa.String(length=100), nullable=True),
        sa.Column("updated_at", sa.Date(), nullable=True),
        sa.Column("updated_by", sa.String(length=100), nullable=True),
        sa.UniqueConstraint("employee_id", "year", "month", name="uq_work_schedule_employee_period"),
    )
    op.create_index("ix_work_schedules_period", "work_schedules", ["year", "month"])

    # Дни планового графика. Тип смены — код из фиксированного каталога.
    op.create_table(
        "work_schedule_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("work_schedules.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("work_date", sa.Date(), nullable=False, index=True),
        sa.Column("shift_type_code", sa.String(length=20), nullable=True, index=True),
        sa.Column("planned_hours_override", sa.Float(), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.UniqueConstraint("schedule_id", "work_date", name="uq_schedule_entry_date"),
    )

    # Метаданные загрузок турникетного журнала
    op.create_table(
        "timesheet_imports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False, index=True),
        sa.Column("period_end", sa.Date(), nullable=False, index=True),
        sa.Column("department_name", sa.String(length=255), nullable=True),
        sa.Column("employees_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("employees_matched", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("employees_unmatched", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("entries_imported", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stored_path", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="completed", index=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("uploaded_by", sa.String(length=100), nullable=True),
        sa.Column("rolled_back_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rolled_back_by", sa.String(length=100), nullable=True),
    )

    # Дневные записи факта
    op.create_table(
        "timesheet_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("import_id", sa.Integer(), sa.ForeignKey("timesheet_imports.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("work_date", sa.Date(), nullable=False, index=True),
        sa.Column("presence_hours", sa.Float(), nullable=True),
        sa.Column("work_hours", sa.Float(), nullable=True),
        sa.Column("absence_hours", sa.Float(), nullable=True),
        sa.Column("debt_hours", sa.Float(), nullable=True),
        sa.Column("night_hours", sa.Float(), nullable=True),
        sa.Column("overtime_hours", sa.Float(), nullable=True),
        sa.Column("department_name", sa.String(length=255), nullable=True),
        sa.Column("position_name", sa.String(length=255), nullable=True),
        sa.Column("schedule_name", sa.String(length=255), nullable=True),
        sa.Column("raw_last_name", sa.String(length=255), nullable=True),
        sa.Column("raw_first_name", sa.String(length=255), nullable=True),
        sa.Column("raw_patronymic", sa.String(length=255), nullable=True),
        sa.Column("raw_tab_number", sa.String(length=50), nullable=True),
        sa.UniqueConstraint("import_id", "employee_id", "work_date", name="uq_timesheet_entry_per_employee_date"),
    )
    op.create_index("ix_timesheet_employee_date", "timesheet_entries", ["employee_id", "work_date"])

    # Несопоставленные строки (для ручной обработки)
    op.create_table(
        "timesheet_unmatched_rows",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("import_id", sa.Integer(), sa.ForeignKey("timesheet_imports.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("last_name", sa.String(length=255), nullable=True),
        sa.Column("first_name", sa.String(length=255), nullable=True),
        sa.Column("patronymic", sa.String(length=255), nullable=True),
        sa.Column("tab_number", sa.String(length=50), nullable=True),
        sa.Column("department_name", sa.String(length=255), nullable=True),
        sa.Column("position_name", sa.String(length=255), nullable=True),
        sa.Column("schedule_name", sa.String(length=255), nullable=True),
        sa.Column("total_hours", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("matched_employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("timesheet_unmatched_rows")
    op.drop_index("ix_timesheet_employee_date", table_name="timesheet_entries")
    op.drop_table("timesheet_entries")
    op.drop_table("timesheet_imports")
    op.drop_table("work_schedule_entries")
    op.drop_index("ix_work_schedules_period", table_name="work_schedules")
    op.drop_table("work_schedules")
