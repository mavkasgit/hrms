"""Начальная схема БД

Revision ID: 0001_initial_schema
Revises: —
Create Date: 2026-04-16
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─────────────────────────────────────────────
    # Справочные таблицы
    # ─────────────────────────────────────────────

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.String(50),
            server_default="hr_specialist",
            nullable=False,
        ),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_by", sa.String(100)),
        sa.CheckConstraint(
            "role IN ('admin', 'hr_manager', 'hr_specialist')",
            name="ck_users_role",
        ),
    )
    op.create_index("ix_users_is_deleted", "users", ["is_deleted"])
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("category", sa.String(100)),
        sa.Column("color", sa.String(7)),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_tags_category", "tags", ["category"])

    op.create_table(
        "holidays",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200)),
        sa.Column(
            "is_working_day",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.create_index("ix_holidays_date", "holidays", ["date"], unique=True)
    op.create_index("ix_holidays_year", "holidays", ["year"])

    op.create_table(
        "references",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("value", sa.String(255), nullable=False),
        sa.Column("order", sa.Integer(), server_default="0"),
    )
    op.create_index("ix_references_category", "references", ["category"])

    op.create_table(
        "position_vacation_config",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("position", sa.String(100), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_position_vacation_config_position",
        "position_vacation_config",
        ["position"],
        unique=True,
    )

    op.create_table(
        "order_sequences",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("last_number", sa.Integer(), server_default="0", nullable=False),
    )

    # ─────────────────────────────────────────────
    # Оргструктура
    # ─────────────────────────────────────────────

    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("short_name", sa.String(50)),
        sa.Column("head_employee_id", sa.Integer()),
        sa.Column("rank", sa.Integer(), server_default="1", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("color", sa.String(7)),
        sa.Column("icon", sa.String(50)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "department_relations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("head_id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column(
            "relation_type",
            sa.Enum("vertical", "matrix", "horizontal", name="relationtype"),
            nullable=False,
            server_default="vertical",
        ),
        sa.ForeignKeyConstraint(["head_id"], ["departments.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["departments.id"]),
    )
    op.create_index(
        "ix_department_relations_head_id", "department_relations", ["head_id"]
    )
    op.create_index(
        "ix_department_relations_child_id", "department_relations", ["child_id"]
    )

    op.create_table(
        "positions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("color", sa.String(7)),
        sa.Column("icon", sa.String(50)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )

    # ─────────────────────────────────────────────
    # Сотрудники
    # ─────────────────────────────────────────────

    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tab_number", sa.Integer()),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("department_id", sa.Integer()),
        sa.Column("position_id", sa.Integer()),
        sa.Column(
            "additional_vacation_days",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        sa.Column("hire_date", sa.Date()),
        sa.Column("birth_date", sa.Date()),
        sa.Column("gender", sa.String(1)),
        sa.Column("citizenship", sa.Boolean(), server_default=sa.true()),
        sa.Column("residency", sa.Boolean(), server_default=sa.true()),
        sa.Column("pensioner", sa.Boolean(), server_default=sa.false()),
        sa.Column("payment_form", sa.String(50)),
        sa.Column("rate", sa.Float()),
        sa.Column("contract_start", sa.Date()),
        sa.Column("contract_end", sa.Date()),
        sa.Column("personal_number", sa.String(50)),
        sa.Column("insurance_number", sa.String(50)),
        sa.Column("passport_number", sa.String(50)),
        sa.Column(
            "is_archived",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("terminated_date", sa.Date()),
        sa.Column("termination_reason", sa.String(255)),
        sa.Column("archived_by", sa.String(100)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_by", sa.String(100)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.ForeignKeyConstraint(["position_id"], ["positions.id"]),
    )
    op.create_index("ix_employees_name", "employees", ["name"])
    op.create_index("ix_employees_department_id", "employees", ["department_id"])
    op.create_index("ix_employees_position_id", "employees", ["position_id"])
    op.create_index("ix_employees_is_archived", "employees", ["is_archived"])
    op.create_index("ix_employees_is_deleted", "employees", ["is_deleted"])
    op.create_index("ix_employees_tab_number", "employees", ["tab_number"], unique=True)

    op.create_foreign_key(
        "fk_departments_head_employee",
        "departments",
        "employees",
        ["head_employee_id"],
        ["id"],
    )

    op.create_table(
        "department_tags",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("department_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"]),
        sa.UniqueConstraint("department_id", "tag_id", name="uq_department_tag"),
    )

    op.create_table(
        "employee_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"]),
        sa.UniqueConstraint("employee_id", "tag_id", name="uq_employee_tag"),
    )
    op.create_index("ix_employee_tags_employee_id", "employee_tags", ["employee_id"])
    op.create_index("ix_employee_tags_tag_id", "employee_tags", ["tag_id"])

    op.create_table(
        "employee_audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("changed_fields", sa.JSON()),
        sa.Column("performed_by", sa.String(100)),
        sa.Column(
            "performed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("reason", sa.String(255)),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
    )
    op.create_index(
        "ix_employee_audit_log_employee_id", "employee_audit_log", ["employee_id"]
    )

    # ─────────────────────────────────────────────
    # Приказы
    # ─────────────────────────────────────────────

    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_number", sa.String(50), nullable=False),
        sa.Column("order_type", sa.String(50), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("order_date", sa.Date(), nullable=False),
        sa.Column(
            "created_date",
            sa.DateTime(),
            server_default=sa.text("now()"),
        ),
        sa.Column("file_path", sa.String(255)),
        sa.Column("notes", sa.Text()),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime()),
        sa.Column("deleted_by", sa.String(100)),
        sa.Column(
            "is_cancelled",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("cancelled_at", sa.DateTime()),
        sa.Column("cancelled_by", sa.String(100)),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
    )
    op.create_index("ix_orders_is_deleted", "orders", ["is_deleted"])
    op.create_index("ix_orders_is_cancelled", "orders", ["is_cancelled"])

    # ─────────────────────────────────────────────
    # Отпуска
    # ─────────────────────────────────────────────

    op.create_table(
        "vacations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("vacation_type", sa.String(50), nullable=False),
        sa.Column("days_count", sa.Integer(), nullable=False),
        sa.Column("vacation_year", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(500)),
        sa.Column("order_id", sa.Integer()),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_by", sa.String(100)),
        sa.Column(
            "is_cancelled",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_by", sa.String(100)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
    )
    op.create_index("ix_vacations_is_deleted", "vacations", ["is_deleted"])
    op.create_index("ix_vacations_is_cancelled", "vacations", ["is_cancelled"])

    op.create_table(
        "vacation_periods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("main_days", sa.Integer(), server_default="24", nullable=False),
        sa.Column("additional_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("used_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("used_days_auto", sa.Integer(), server_default="0", nullable=False),
        sa.Column("used_days_manual", sa.Integer(), server_default="0", nullable=False),
        sa.Column("remaining_days", sa.Integer()),
        sa.Column("order_ids", sa.String()),
        sa.Column("order_numbers", sa.String()),
        sa.Column("order_days_map", sa.String()),
        sa.Column("year_number", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
    )
    op.create_index(
        "ix_vacation_periods_employee_id", "vacation_periods", ["employee_id"]
    )

    op.create_table(
        "vacation_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("plan_count", sa.String(50), nullable=False),
        sa.Column("comment", sa.String(200)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.UniqueConstraint(
            "employee_id", "year", "month", name="uq_vacation_plan_emp_year_month"
        ),
    )
    op.create_index("ix_vacation_plans_employee_id", "vacation_plans", ["employee_id"])
    op.create_index("ix_vacation_plans_year", "vacation_plans", ["year"])

    op.create_index(
        "ix_department_tags_department_id", "department_tags", ["department_id"]
    )
    op.create_index("ix_department_tags_tag_id", "department_tags", ["tag_id"])

    # ─────────────────────────────────────────────
    # Больничные
    # ─────────────────────────────────────────────

    op.create_table(
        "sick_leaves",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("active", "cancelled", "deleted", name="sickleavestatus"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("comment", sa.String(500)),
        sa.Column("created_at", sa.Date(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.Date()),
        sa.Column("updated_by", sa.Integer()),
        sa.Column("deleted_by", sa.Integer()),
        sa.Column("cancelled_by", sa.Integer()),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["deleted_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["cancelled_by"], ["users.id"]),
    )
    op.create_index("ix_sick_leaves_id", "sick_leaves", ["id"])
    op.create_index("ix_sick_leaves_employee_id", "sick_leaves", ["employee_id"])
    op.create_index("ix_sick_leaves_start_date", "sick_leaves", ["start_date"])
    op.create_index("ix_sick_leaves_end_date", "sick_leaves", ["end_date"])
    op.create_index("ix_sick_leaves_status", "sick_leaves", ["status"])
    op.create_index(
        "ix_sick_leaves_employee_dates",
        "sick_leaves",
        ["employee_id", "start_date", "end_date"],
    )
    op.create_index(
        "ix_sick_leaves_status_filter",
        "sick_leaves",
        ["status", "employee_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_sick_leaves_status_filter", table_name="sick_leaves")
    op.drop_index("ix_sick_leaves_employee_dates", table_name="sick_leaves")
    op.drop_index("ix_sick_leaves_status", table_name="sick_leaves")
    op.drop_index("ix_sick_leaves_end_date", table_name="sick_leaves")
    op.drop_index("ix_sick_leaves_start_date", table_name="sick_leaves")
    op.drop_index("ix_sick_leaves_employee_id", table_name="sick_leaves")
    op.drop_index("ix_sick_leaves_id", table_name="sick_leaves")
    op.drop_table("sick_leaves")
    sa.Enum(name="sickleavestatus").drop(op.get_bind())

    op.drop_index("ix_vacation_plans_year", table_name="vacation_plans")
    op.drop_index("ix_vacation_plans_employee_id", table_name="vacation_plans")
    op.drop_table("vacation_plans")

    op.drop_index("ix_vacation_periods_employee_id", table_name="vacation_periods")
    op.drop_table("vacation_periods")

    op.drop_index("ix_vacations_is_cancelled", table_name="vacations")
    op.drop_index("ix_vacations_is_deleted", table_name="vacations")
    op.drop_table("vacations")

    op.drop_index("ix_orders_is_cancelled", table_name="orders")
    op.drop_index("ix_orders_is_deleted", table_name="orders")
    op.drop_table("orders")

    op.drop_index("ix_employee_audit_log_employee_id", table_name="employee_audit_log")
    op.drop_table("employee_audit_log")

    op.drop_index("ix_employee_tags_tag_id", table_name="employee_tags")
    op.drop_index("ix_employee_tags_employee_id", table_name="employee_tags")
    op.drop_table("employee_tags")
    op.drop_index("ix_department_tags_tag_id", table_name="department_tags")
    op.drop_index("ix_department_tags_department_id", table_name="department_tags")
    op.drop_table("department_tags")

    op.drop_constraint(
        "fk_departments_head_employee", "departments", type_="foreignkey"
    )

    op.drop_index("ix_employees_tab_number", table_name="employees")
    op.drop_index("ix_employees_is_deleted", table_name="employees")
    op.drop_index("ix_employees_is_archived", table_name="employees")
    op.drop_index("ix_employees_position_id", table_name="employees")
    op.drop_index("ix_employees_department_id", table_name="employees")
    op.drop_index("ix_employees_name", table_name="employees")
    op.drop_table("employees")

    op.drop_table("positions")

    op.drop_index("ix_department_relations_child_id", table_name="department_relations")
    op.drop_index("ix_department_relations_head_id", table_name="department_relations")
    op.drop_table("department_relations")
    op.execute("DROP TYPE IF EXISTS relationtype")

    op.drop_table("departments")

    op.drop_index("ix_holidays_year", table_name="holidays")
    op.drop_index("ix_holidays_date", table_name="holidays")
    op.drop_table("holidays")

    op.drop_index("ix_references_category", table_name="references")
    op.drop_table("references")

    op.drop_index(
        "ix_position_vacation_config_position",
        table_name="position_vacation_config",
    )
    op.drop_table("position_vacation_config")
    op.drop_table("order_sequences")

    op.drop_index("ix_tags_category", table_name="tags")
    op.drop_table("tags")

    op.drop_index("ix_users_is_deleted", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
