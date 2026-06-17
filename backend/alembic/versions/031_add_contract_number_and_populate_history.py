"""add contract_number to employees and populate contract_history

Revision ID: 031
Revises: 030
Create Date: 2026-06-01 02:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '031'
down_revision = '030'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. Add contract_number column to employees
    emp_columns = [col["name"] for col in inspector.get_columns("employees")]
    if "contract_number" not in emp_columns:
        op.add_column("employees", sa.Column("contract_number", sa.String(length=50), nullable=True))

    # 2. Populate contract_history from existing employees with contract_start
    # Check if contract_history has any data
    result = conn.execute(sa.text("SELECT COUNT(*) FROM contract_history"))
    existing_count = result.scalar()

    if existing_count == 0:
        # Insert initial contract history records for employees with contract_start
        op.execute(
            sa.text("""
            INSERT INTO contract_history (employee_id, order_id, contract_number, contract_start, contract_end, contract_years, order_type_code, created_at)
            SELECT
                id,
                NULL,
                contract_number,
                contract_start,
                contract_end,
                CASE
                    WHEN contract_start IS NOT NULL AND contract_end IS NOT NULL THEN
                        CEIL(EXTRACT(EPOCH FROM (contract_end::timestamp - contract_start::timestamp)) / 31557600)
                    ELSE NULL
                END,
                'initial',
                NOW()
            FROM employees
            WHERE contract_start IS NOT NULL
            """)
        )


def downgrade() -> None:
    op.drop_column("employees", "contract_number")
    op.execute(sa.text("DELETE FROM contract_history WHERE order_type_code = 'initial'"))
