"""sick_leaves provenance identity (#110)

Break-glass (emergency_admin) существует вне таблицы users, но должен иметь
возможность создавать/изменять больничные. Provenance переводится с жёсткого
NOT NULL FK users.id на identity-строку (username / emergency_admin):

- created_by становится nullable FK (заполняется только для реальных
  пользователей);
- добавляются created_by_identity / updated_by_identity / deleted_by_identity —
  строковые identity-акторы (прецедент: work_schedule, vacation_period и др.);
- исторические записи бэкфиллятся: identity-колонки = username из users по FK.

Revision ID: 053
Revises: 052
Create Date: 2026-08-13

"""
from alembic import op
import sqlalchemy as sa


revision = "053"
down_revision = "052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "sick_leaves",
        "created_by",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.add_column(
        "sick_leaves",
        sa.Column("created_by_identity", sa.String(100), nullable=True),
    )
    op.add_column(
        "sick_leaves",
        sa.Column("updated_by_identity", sa.String(100), nullable=True),
    )
    op.add_column(
        "sick_leaves",
        sa.Column("deleted_by_identity", sa.String(100), nullable=True),
    )

    # Бэкфилл исторических записей: int FK -> username из users.
    op.execute(
        """
        UPDATE sick_leaves sl
        SET created_by_identity = u.username
        FROM users u
        WHERE sl.created_by = u.id AND sl.created_by_identity IS NULL
        """
    )
    op.execute(
        """
        UPDATE sick_leaves sl
        SET updated_by_identity = u.username
        FROM users u
        WHERE sl.updated_by = u.id AND sl.updated_by_identity IS NULL
        """
    )
    op.execute(
        """
        UPDATE sick_leaves sl
        SET deleted_by_identity = u.username
        FROM users u
        WHERE sl.deleted_by = u.id AND sl.deleted_by_identity IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("sick_leaves", "deleted_by_identity")
    op.drop_column("sick_leaves", "updated_by_identity")
    op.drop_column("sick_leaves", "created_by_identity")
    op.alter_column(
        "sick_leaves",
        "created_by",
        existing_type=sa.Integer(),
        nullable=False,
    )
