"""rename staffing_documents to documents and add doc_code

Revision ID: 20260504_0200
Revises: a1b2c3d4e5f6
Create Date: 2026-05-04 02:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '20260504_0200'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Переименовываем таблицу
    op.rename_table('staffing_documents', 'documents')

    # Добавляем колонку doc_code
    op.add_column('documents', sa.Column('doc_code', sa.String(50), nullable=True))

    # Заполняем существующие записи
    op.execute("UPDATE documents SET doc_code = 'staffing' WHERE doc_code IS NULL")

    # Делаем NOT NULL
    op.alter_column('documents', 'doc_code', nullable=False)

    # Создаём индекс
    op.create_index('ix_documents_doc_code_is_current', 'documents', ['doc_code', 'is_current'])


def downgrade() -> None:
    # Удаляем индекс
    op.drop_index('ix_documents_doc_code_is_current', 'documents')

    # Переименовываем обратно
    op.drop_column('documents', 'doc_code')
    op.rename_table('documents', 'staffing_documents')
