"""add type management for statements and notifications

Revision ID: 029
Revises: 028
Create Date: 2026-05-19 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '029'
down_revision = '028'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # Create statement_types table if not exists
    if "statement_types" not in existing_tables:
        op.create_table(
            "statement_types",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("code", sa.String(length=100), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("template_filename", sa.String(length=255), nullable=True),
            sa.Column("display_name", sa.String(length=500), nullable=True),
            sa.Column("field_schema", sa.JSON(), server_default="[]", nullable=False),
            sa.Column("filename_pattern", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index(op.f("ix_statement_types_code"), "statement_types", ["code"], unique=True)
        op.create_index(op.f("ix_statement_types_name"), "statement_types", ["name"], unique=True)
        op.create_index(op.f("ix_statement_types_is_active"), "statement_types", ["is_active"], unique=False)

    # Create notification_types table if not exists
    if "notification_types" not in existing_tables:
        op.create_table(
            "notification_types",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("code", sa.String(length=100), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("template_filename", sa.String(length=255), nullable=True),
            sa.Column("display_name", sa.String(length=500), nullable=True),
            sa.Column("field_schema", sa.JSON(), server_default="[]", nullable=False),
            sa.Column("filename_pattern", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index(op.f("ix_notification_types_code"), "notification_types", ["code"], unique=True)
        op.create_index(op.f("ix_notification_types_name"), "notification_types", ["name"], unique=True)
        op.create_index(op.f("ix_notification_types_is_active"), "notification_types", ["is_active"], unique=False)

    # Check statements columns
    stmt_columns = [col["name"] for col in inspector.get_columns("statements")]

    # Add statement_type_id FK and extra_fields to statements
    if "statement_type_id" not in stmt_columns:
        op.add_column("statements", sa.Column("statement_type_id", sa.Integer(), nullable=True))
        op.create_index(
            op.f("ix_statements_statement_type_id"),
            "statements",
            ["statement_type_id"],
            unique=False,
        )
        op.create_foreign_key(
            "fk_statements_statement_type_id",
            "statements",
            "statement_types",
            ["statement_type_id"],
            ["id"],
        )
    if "extra_fields" not in stmt_columns:
        op.add_column("statements", sa.Column("extra_fields", sa.JSON(), nullable=True))

    # Check notifications columns
    notif_columns = [col["name"] for col in inspector.get_columns("notifications")]

    # Add notification_type_id FK and extra_fields to notifications
    if "notification_type_id" not in notif_columns:
        op.add_column("notifications", sa.Column("notification_type_id", sa.Integer(), nullable=True))
        op.create_index(
            op.f("ix_notifications_notification_type_id"),
            "notifications",
            ["notification_type_id"],
            unique=False,
        )
    if "extra_fields" not in notif_columns:
        op.add_column("notifications", sa.Column("extra_fields", sa.JSON(), nullable=True))

    # Create FK for notifications if not exists
    notif_fks = inspector.get_foreign_keys("notifications")
    has_notif_type_fk = any(
        fk.get("constrained_columns") == ["notification_type_id"]
        for fk in notif_fks
    )
    if not has_notif_type_fk:
        op.create_foreign_key(
            "fk_notifications_notification_type_id",
            "notifications",
            "notification_types",
            ["notification_type_id"],
            ["id"],
        )

    # Drop old statement_type string column if exists
    if "statement_type" in stmt_columns:
        op.drop_column("statements", "statement_type")


def downgrade() -> None:
    # Re-add statement_type string column
    op.add_column("statements", sa.Column("statement_type", sa.String(length=100), nullable=True))

    # Drop FK and columns from statements
    op.drop_constraint("fk_statements_statement_type_id", "statements", type_="foreignkey")
    op.drop_index(op.f("ix_statements_statement_type_id"), table_name="statements")
    op.drop_column("statements", "extra_fields")
    op.drop_column("statements", "statement_type_id")

    # Drop notification_type_id FK and column
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    fks = inspector.get_foreign_keys("notifications")
    for fk in fks:
        if fk.get("constrained_columns") == ["notification_type_id"]:
            op.drop_constraint(fk.get("name"), "notifications", type_="foreignkey")
            break
    op.drop_index(op.f("ix_notifications_notification_type_id"), table_name="notifications", if_exists=True)
    # Drop extra_fields if it exists
    columns = [col["name"] for col in inspector.get_columns("notifications")]
    if "extra_fields" in columns:
        op.drop_column("notifications", "extra_fields")
    if "notification_type_id" in columns:
        op.drop_column("notifications", "notification_type_id")

    # Drop type tables
    op.drop_table("notification_types")
    op.drop_table("statement_types")
