"""orders source_draft_id

Provenance-колонки черновика приказа (ADR-0009, #91): source_draft_id /
source_draft_created_by — opaque provenance, не FK. Писатель колонок
появится в T4/T5; сейчас миграция добавляет только схему. Partial unique
index на source_draft_id (WHERE ... IS NOT NULL): direct-create приказы
(NULL) в индекс не попадают и не нарушают уникальность.

Revision ID: 052
Revises: 051
Create Date: 2026-08-10

"""
from alembic import op
import sqlalchemy as sa


revision = "052"
down_revision = "051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("source_draft_id", sa.String(255), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("source_draft_created_by", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_orders_source_draft_id_unique",
        "orders",
        ["source_draft_id"],
        unique=True,
        postgresql_where=sa.text("source_draft_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_orders_source_draft_id_unique", table_name="orders")
    op.drop_column("orders", "source_draft_created_by")
    op.drop_column("orders", "source_draft_id")
