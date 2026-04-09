"""add vacation periods and additional_vacation_days to employees

Revision ID: 005_vacation_periods
Revises: 003_vacation_management
Create Date: 2026-04-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column

revision = "005_vacation_periods"
down_revision = "004_vacation_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Добавить additional_vacation_days в employees
    op.add_column("employees", sa.Column("additional_vacation_days", sa.Integer(), nullable=False, server_default="0"))

    # 2. Создать таблицу vacation_periods
    op.create_table(
        "vacation_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False, index=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("main_days", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("additional_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("year_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # 3. Создать периоды для существующих сотрудников
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
                    main_days=24,
                    additional_days=add_days or 0,
                    year_number=year_num,
                )
            )


def downgrade() -> None:
    op.drop_table("vacation_periods")
    op.drop_column("employees", "additional_vacation_days")
