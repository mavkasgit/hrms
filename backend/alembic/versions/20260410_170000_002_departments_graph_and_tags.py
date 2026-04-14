"""departments_graph_and_department_tags

Revision ID: 002_departments_graph
Revises: 45d37474312a
Create Date: 2026-04-10 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_departments_graph'
down_revision: Union[str, None] = '45d37474312a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Создаём таблицу department_tags
    op.create_table(
        'department_tags',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('department_id', sa.Integer(), nullable=False, index=True),
        sa.Column('tag_id', sa.Integer(), nullable=False, index=True),
        sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ),
        sa.UniqueConstraint('department_id', 'tag_id', name='uq_department_tag'),
    )

    # 2. Создаём таблицу department_relations (граф связей)
    op.create_table(
        'department_relations',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('head_id', sa.Integer(), nullable=False, index=True),
        sa.Column('child_id', sa.Integer(), nullable=False, index=True),
        sa.Column('relation_type', sa.Enum('vertical', 'matrix', 'horizontal', name='relationtype'), nullable=False, server_default='vertical'),
        sa.ForeignKeyConstraint(['head_id'], ['departments.id'], ),
        sa.ForeignKeyConstraint(['child_id'], ['departments.id'], ),
    )

    # 3. Добавляем колонку rank в departments
    op.add_column('departments', sa.Column('rank', sa.Integer(), nullable=False, server_default='1'))

    # 4. МИГРАЦИЯ ДАННЫХ: переносим parent_id -> department_relations
    # Сначала проверяем, есть ли ещё колонка parent_id (она есть из начальной схемы)
    # Создаём временную выборку всех отделов с parent_id
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('departments')]

    if 'parent_id' in columns:
        # Мигрируем все существующие parent_id -> department_relations (тип vertical)
        result = conn.execute(sa.text("SELECT id, parent_id FROM departments WHERE parent_id IS NOT NULL"))
        rows = result.fetchall()

        for dept_id, parent_id in rows:
            conn.execute(
                sa.text(
                    "INSERT INTO department_relations (head_id, child_id, relation_type) "
                    "VALUES (:head_id, :child_id, 'vertical')"
                ),
                {"head_id": parent_id, "child_id": dept_id},
            )

        # 5. Удаляем parent_id только ПОСЛЕ миграции данных
        # Сначала удаляем FK constraint
        # Находим имя FK
        fks = inspector.get_foreign_keys('departments')
        for fk in fks:
            if 'parent_id' in fk.get('constrained_columns', []):
                fk_name = fk.get('name')
                if fk_name:
                    op.drop_constraint(fk_name, 'departments', type_='foreignkey')
                break

        # Удаляем индекс на parent_id
        op.drop_index('ix_departments_parent_id', table_name='departments')

        # Удаляем колонку
        op.drop_column('departments', 'parent_id')


def downgrade() -> None:
    conn = op.get_bind()

    # 1. Возвращаем parent_id
    op.add_column(
        'departments',
        sa.Column('parent_id', sa.Integer(), nullable=True, index=True),
    )

    # 2. Добавляем FK на parent_id (self-reference)
    op.create_foreign_key(
        'fk_departments_parent_id',
        'departments', 'departments',
        ['parent_id'], ['id'],
    )

    # 3. Восстанавливаем индекс
    op.create_index('ix_departments_parent_id', 'departments', ['parent_id'])

    # 4. Мигрируем данные обратно: department_relations (vertical) -> parent_id
    result = conn.execute(
        sa.text(
            "SELECT head_id, child_id FROM department_relations WHERE relation_type = 'vertical'"
        )
    )
    rows = result.fetchall()

    for head_id, child_id in rows:
        conn.execute(
            sa.text(
                "UPDATE departments SET parent_id = :parent_id WHERE id = :id"
            ),
            {"parent_id": head_id, "id": child_id},
        )

    # 5. Удаляем новые таблицы
    op.drop_column('departments', 'rank')
    op.drop_table('department_relations')
    op.drop_table('department_tags')

    # Удаляем enum type
    op.execute("DROP TYPE IF exists relationtype")
