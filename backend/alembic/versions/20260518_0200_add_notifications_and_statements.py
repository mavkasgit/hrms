"""add notifications and statements tables

Revision ID: 20260518_0200
Revises: 20260518_0100
Create Date: 2026-05-18 02:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260518_0200"
down_revision = "20260518_0100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("number", sa.String(length=50), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(length=500), nullable=True),
        sa.Column("is_draft", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notifications_employee_id"), "notifications", ["employee_id"], unique=False)
    op.create_index(op.f("ix_notifications_is_draft"), "notifications", ["is_draft"], unique=False)

    op.create_table(
        "statements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("number", sa.String(length=50), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.Column("statement_type", sa.String(length=100), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(length=500), nullable=True),
        sa.Column("is_draft", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_statements_employee_id"), "statements", ["employee_id"], unique=False)
    op.create_index(op.f("ix_statements_is_draft"), "statements", ["is_draft"], unique=False)


def downgrade() -> None:
    op.drop_table("statements")
    op.drop_table("notifications")
