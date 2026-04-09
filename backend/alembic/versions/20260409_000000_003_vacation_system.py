"""add complete vacation management system

Revision ID: 003_vacation_system
Revises: 002_order_dates_local_time
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import table, column

revision = "003_vacation_system"
down_revision = "002_order_dates_local_time"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ========== EMPLOYEES: добавляем поле additional_vacation_days ==========
    op.add_column("employees", sa.Column("additional_vacation_days", sa.Integer(), nullable=False, server_default="0"))

    # ========== VACATIONS: расширяем функциональность ==========
    # Добавляем связь с приказами
    op.add_column("vacations", sa.Column("order_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_vacations_order_id", "vacations", "orders", ["order_id"], ["id"])
    
    # Добавляем комментарий и отмену
    op.add_column("vacations", sa.Column("comment", sa.String(500), nullable=True))
    op.add_column("vacations", sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("vacations", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("vacations", sa.Column("cancelled_by", sa.String(100), nullable=True))

    # ========== HOLIDAYS: таблица праздников ==========
    op.create_table(
        "holidays",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("date", sa.Date(), nullable=False, unique=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_working_day", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ========== VACATION_PERIODS: система периодов отпусков ==========
    op.create_table(
        "vacation_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False, index=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("main_days", sa.Integer(), nullable=False, server_default="28"),
        sa.Column("additional_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("used_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("year_number", sa.Integer(), nullable=False),
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # ========== VACATION_PLANS: планирование отпусков ==========
    op.create_table(
        "vacation_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False, index=True),
        sa.Column("year", sa.Integer(), nullable=False, index=True),
        sa.Column("planned_start", sa.Date(), nullable=False),
        sa.Column("planned_end", sa.Date(), nullable=False),
        sa.Column("planned_days", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="planned"),
        sa.Column("comment", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("created_by", sa.String(100), nullable=True),
    )

    # ========== Создаём периоды для существующих сотрудников ==========
    employees = table(
        "employees",
        column("id", sa.Integer),
        column("contract_start", sa.Date),
        column("additional_vacation_days", sa.Integer),
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.select(employees.c.id, employees.c.contract_start, employees.c.additional_vacation_days)
        .where(employees.c.contract_start.isnot(None))
    ).fetchall()

    vacation_periods = table(
        "vacation_periods",
        column("employee_id", sa.Integer),
        column("period_start", sa.Date),
        column("period_end", sa.Date),
        column("main_days", sa.Integer),
        column("additional_days", sa.Integer),
        column("year_number", sa.Integer),
    )

    for emp_id, contract_start, add_days in rows:
        import datetime
        # Определяем сколько периодов нужно: от contract_start до текущего года
        current_year = datetime.date.today().year
        total_periods = current_year - contract_start.year + 1

        for year_num in range(1, total_periods + 1):
            period_start = contract_start.replace(year=contract_start.year + year_num - 1)
            period_end = period_start.replace(year=period_start.year + 1)
            period_end = period_end - datetime.timedelta(days=1)

            connection.execute(
                sa.insert(vacation_periods).values(
                    employee_id=emp_id,
                    period_start=period_start,
                    period_end=period_end,
                    main_days=28,
                    additional_days=add_days or 0,
                    year_number=year_num,
                )
            )


def downgrade() -> None:
    # Удаляем таблицы
    op.drop_table("vacation_plans")
    op.drop_table("vacation_periods")
    op.drop_table("holidays")
    
    # Удаляем колонки из vacations
    op.drop_constraint("fk_vacations_order_id", "vacations", type_="foreignkey")
    op.drop_column("vacations", "order_id")
    op.drop_column("vacations", "comment")
    op.drop_column("vacations", "is_cancelled")
    op.drop_column("vacations", "cancelled_at")
    op.drop_column("vacations", "cancelled_by")
    
    # Удаляем колонку из employees
    op.drop_column("employees", "additional_vacation_days")
