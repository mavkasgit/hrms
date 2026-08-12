"""sick_leaves provenance: FK int → строка (единый стандарт #110)

Доводим sick-leaves до строкового provenance, как во всей кодовой базе
(work_schedule, order, vacation_period и др.):

- дропаются int-FK колонки created_by / updated_by / deleted_by (FK-констрейнты
  удаляются вместе с колонками);
- identity-колонки (*_identity), заполненные в 053, переименовываются в
  стандартные имена created_by / updated_by / deleted_by (String(100), nullable).

Актор пишется строкой (username / break-glass emergency_admin) напрямую из
токена, без lookup в users.

Revision ID: 054
Revises: 053
Create Date: 2026-08-13

"""
from alembic import op
import sqlalchemy as sa


revision = "054"
down_revision = "053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("sick_leaves", "created_by")
    op.drop_column("sick_leaves", "updated_by")
    op.drop_column("sick_leaves", "deleted_by")

    op.alter_column("sick_leaves", "created_by_identity", new_column_name="created_by")
    op.alter_column("sick_leaves", "updated_by_identity", new_column_name="updated_by")
    op.alter_column("sick_leaves", "deleted_by_identity", new_column_name="deleted_by")


def downgrade() -> None:
    # Lossy: int-FK значения уже утрачены, восстанавливаем только схему
    # (nullable int-колонки + FK-констрейнты; NOT NULL не возвращаем — после
    # 053 и 054 колонки строковые и nullable).
    op.alter_column("sick_leaves", "created_by", new_column_name="created_by_identity")
    op.alter_column("sick_leaves", "updated_by", new_column_name="updated_by_identity")
    op.alter_column("sick_leaves", "deleted_by", new_column_name="deleted_by_identity")

    op.add_column("sick_leaves", sa.Column("created_by", sa.Integer(), nullable=True))
    op.add_column("sick_leaves", sa.Column("updated_by", sa.Integer(), nullable=True))
    op.add_column("sick_leaves", sa.Column("deleted_by", sa.Integer(), nullable=True))

    op.create_foreign_key(
        "sick_leaves_created_by_fkey", "sick_leaves", "users", ["created_by"], ["id"]
    )
    op.create_foreign_key(
        "sick_leaves_updated_by_fkey", "sick_leaves", "users", ["updated_by"], ["id"]
    )
    op.create_foreign_key(
        "sick_leaves_deleted_by_fkey", "sick_leaves", "users", ["deleted_by"], ["id"]
    )
