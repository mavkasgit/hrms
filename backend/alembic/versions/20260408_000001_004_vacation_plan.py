"""add vacation plans calendar

Revision ID: 004_vacation_plan
Revises: 003_vacation_management
Create Date: 2026-04-08
"""
from alembic import op
import sqlalchemy as sa

revision = "004_vacation_plan"
down_revision = "003_vacation_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vacation_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False, index=True),
        sa.Column("year", sa.Integer(), nullable=False, index=True),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("days", sa.Float(), nullable=False),
        sa.Column("comment", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("employee_id", "year", "month", name="uq_vacation_plan_emp_year_month"),
    )


def downgrade() -> None:
    op.drop_table("vacation_plans")
