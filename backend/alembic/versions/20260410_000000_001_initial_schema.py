"""initial schema with org structure

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-04-10
"""
from alembic import op
import sqlalchemy as sa


revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), server_default="hr_specialist", nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_by", sa.String(100)),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        sa.CheckConstraint("role IN ('admin', 'hr_manager', 'hr_specialist')", name="ck_users_role"),
    )

    # 2. departments (before employees)
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("short_name", sa.String(50)),
        sa.Column("parent_id", sa.Integer()),
        sa.Column("head_employee_id", sa.Integer()),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["parent_id"], ["departments.id"]),
    )
    op.create_index("ix_departments_parent_id", "departments", ["parent_id"])

    # 3. positions (before employees)
    op.create_table(
        "positions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )

    # 4. tags (independent)
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # 5. employees (references departments, positions)
    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tab_number", sa.Integer()),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=False),
        sa.Column("position_id", sa.Integer(), nullable=False),
        sa.Column("additional_vacation_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("hire_date", sa.Date()),
        sa.Column("birth_date", sa.Date()),
        sa.Column("gender", sa.String(1)),
        sa.Column("citizenship", sa.Boolean(), server_default="true"),
        sa.Column("residency", sa.Boolean(), server_default="true"),
        sa.Column("pensioner", sa.Boolean(), server_default="false"),
        sa.Column("payment_form", sa.String(50)),
        sa.Column("rate", sa.Float()),
        sa.Column("contract_start", sa.Date()),
        sa.Column("contract_end", sa.Date()),
        sa.Column("personal_number", sa.String(50)),
        sa.Column("insurance_number", sa.String(50)),
        sa.Column("passport_number", sa.String(50)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("is_archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("terminated_date", sa.Date()),
        sa.Column("termination_reason", sa.String(255)),
        sa.Column("archived_by", sa.String(100)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_by", sa.String(100)),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.ForeignKeyConstraint(["position_id"], ["positions.id"]),
    )
    op.create_index("ix_employees_department_id", "employees", ["department_id"])
    op.create_index("ix_employees_position_id", "employees", ["position_id"])
    op.create_index("ix_employees_is_archived", "employees", ["is_archived"])
    op.create_index("ix_employees_is_deleted", "employees", ["is_deleted"])
    op.create_index("ix_employees_name", "employees", ["name"])
    op.create_index("ix_employees_tab_number", "employees", ["tab_number"], unique=True)

    # 6. employee_tags (references employees, tags)
    op.create_table(
        "employee_tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"]),
        sa.UniqueConstraint("employee_id", "tag_id", name="uq_employee_tag"),
    )
    op.create_index("ix_employee_tags_employee_id", "employee_tags", ["employee_id"])
    op.create_index("ix_employee_tags_tag_id", "employee_tags", ["tag_id"])

    # 7. orders (references employees)
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_number", sa.String(50), nullable=False),
        sa.Column("order_type", sa.String(50), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("order_date", sa.Date(), nullable=False),
        sa.Column("created_date", sa.DateTime(), server_default=sa.text("now()")),
        sa.Column("file_path", sa.String(255)),
        sa.Column("notes", sa.Text()),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime()),
        sa.Column("deleted_by", sa.String(100)),
        sa.Column("is_cancelled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("cancelled_at", sa.DateTime()),
        sa.Column("cancelled_by", sa.String(100)),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
    )
    op.create_index("ix_orders_is_deleted", "orders", ["is_deleted"])

    # 8. vacations (references employees, orders)
    op.create_table(
        "vacations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("vacation_type", sa.String(50), nullable=False),
        sa.Column("days_count", sa.Integer(), nullable=False),
        sa.Column("vacation_year", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_by", sa.String(100)),
        sa.Column("comment", sa.String(500)),
        sa.Column("order_id", sa.Integer()),
        sa.Column("is_cancelled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_by", sa.String(100)),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
    )
    op.create_index("ix_vacations_is_deleted", "vacations", ["is_deleted"])

    # 9. vacation_periods (references employees)
    op.create_table(
        "vacation_periods",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("main_days", sa.Integer(), server_default="24", nullable=False),
        sa.Column("additional_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("used_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("year_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
    )
    op.create_index("ix_vacation_periods_employee_id", "vacation_periods", ["employee_id"])

    # 10. vacation_plans (references employees)
    op.create_table(
        "vacation_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("days_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.UniqueConstraint("employee_id", "year", "month", name="uq_vacation_plan_employee_year_month"),
    )
    op.create_index("ix_vacation_plans_employee_id", "vacation_plans", ["employee_id"])
    op.create_index("ix_vacation_plans_year", "vacation_plans", ["year"])

    # 11. employee_audit_log (references employees)
    op.create_table(
        "employee_audit_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("changed_fields", sa.JSON()),
        sa.Column("performed_by", sa.String(100)),
        sa.Column("performed_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("reason", sa.String(255)),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
    )
    op.create_index("ix_employee_audit_log_employee_id", "employee_audit_log", ["employee_id"])

    # 10. order_sequences
    op.create_table(
        "order_sequences",
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("last_number", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("year"),
    )

    # 11. templates
    op.create_table(
        "templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_type", sa.String(100), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_content", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_by", sa.String(100)),
        sa.PrimaryKeyConstraint("id"),
    )

    # 12. holidays (reference data)
    op.create_table(
        "holidays",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255)),
        sa.Column("is_working_day", sa.Boolean(), server_default="false", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("date"),
    )
    op.create_index("ix_holidays_year", "holidays", ["year"])


def downgrade() -> None:
    op.drop_index("ix_holidays_year", table_name="holidays")
    op.drop_table("holidays")
    op.drop_table("templates")
    op.drop_table("order_sequences")
    op.drop_index("ix_employee_audit_log_employee_id", table_name="employee_audit_log")
    op.drop_table("employee_audit_log")
    op.drop_index("ix_vacation_plans_year", table_name="vacation_plans")
    op.drop_index("ix_vacation_plans_employee_id", table_name="vacation_plans")
    op.drop_table("vacation_plans")
    op.drop_index("ix_vacation_periods_employee_id", table_name="vacation_periods")
    op.drop_table("vacation_periods")
    op.drop_index("ix_vacations_is_deleted", table_name="vacations")
    op.drop_table("vacations")
    op.drop_index("ix_orders_is_deleted", table_name="orders")
    op.drop_table("orders")
    op.drop_index("ix_employee_tags_tag_id", table_name="employee_tags")
    op.drop_index("ix_employee_tags_employee_id", table_name="employee_tags")
    op.drop_table("employee_tags")
    op.drop_index("ix_employees_tab_number", table_name="employees")
    op.drop_index("ix_employees_name", table_name="employees")
    op.drop_index("ix_employees_is_deleted", table_name="employees")
    op.drop_index("ix_employees_is_archived", table_name="employees")
    op.drop_index("ix_employees_position_id", table_name="employees")
    op.drop_index("ix_employees_department_id", table_name="employees")
    op.drop_table("employees")
    op.drop_table("tags")
    op.drop_table("positions")
    op.drop_index("ix_departments_parent_id", table_name="departments")
    op.drop_table("departments")
    op.drop_table("users")