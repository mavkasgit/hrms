"""add recall, postpone and extension fields to vacations

Revision ID: 20260505_0100
Revises: 20260504_0200
Create Date: 2026-05-05 01:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '20260505_0100'
down_revision = '20260504_0200'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем поля для отслеживания отзыва из отпуска
    op.add_column('vacations', sa.Column('is_recalled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('vacations', sa.Column('recall_date', sa.Date(), nullable=True))
    op.add_column('vacations', sa.Column('recall_order_id', sa.Integer(), nullable=True))
    
    # Добавляем поля для переноса отпуска
    op.add_column('vacations', sa.Column('is_postponed', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('vacations', sa.Column('postpone_order_id', sa.Integer(), nullable=True))
    
    # Добавляем поля для продления отпуска
    op.add_column('vacations', sa.Column('is_extended', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('vacations', sa.Column('extension_order_id', sa.Integer(), nullable=True))
    
    # Создаем индексы
    op.create_index('ix_vacations_is_recalled', 'vacations', ['is_recalled'])
    op.create_index('ix_vacations_is_postponed', 'vacations', ['is_postponed'])
    op.create_index('ix_vacations_is_extended', 'vacations', ['is_extended'])
    op.create_foreign_key('fk_vacations_recall_order', 'vacations', 'orders', ['recall_order_id'], ['id'])
    op.create_foreign_key('fk_vacations_postpone_order', 'vacations', 'orders', ['postpone_order_id'], ['id'])
    op.create_foreign_key('fk_vacations_extension_order', 'vacations', 'orders', ['extension_order_id'], ['id'])

    # Добавляем типы приказов для отпуска
    op.execute("""
        INSERT INTO order_types (code, name, is_active, show_in_orders_page, letter, field_schema, template_filename, filename_pattern)
        VALUES 
            (
                'vacation_recall',
                'Отзыв из отпуска',
                true,
                false,
                'л',
                '[
                    {"key": "recall_date", "label": "Дата отзыва", "type": "date", "required": true},
                    {"key": "old_vacation_start", "label": "Дата начала отпуска", "type": "date", "required": true},
                    {"key": "old_vacation_end", "label": "Дата окончания отпуска", "type": "date", "required": true},
                    {"key": "old_vacation_days", "label": "Количество дней отпуска", "type": "number", "required": true},
                    {"key": "reason", "label": "Основание", "type": "text", "required": false}
                ]'::json,
                'prikaz_otzyv_iz_otpuska.docx',
                'Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx'
            ),
            (
                'vacation_postpone',
                'Перенос отпуска',
                true,
                false,
                'л',
                '[
                    {"key": "old_vacation_start", "label": "Старая дата начала", "type": "date", "required": true},
                    {"key": "old_vacation_end", "label": "Старая дата окончания", "type": "date", "required": true},
                    {"key": "new_vacation_start", "label": "Новая дата начала", "type": "date", "required": true},
                    {"key": "new_vacation_end", "label": "Новая дата окончания", "type": "date", "required": true},
                    {"key": "vacation_days", "label": "Количество дней", "type": "number", "required": true},
                    {"key": "reason", "label": "Основание", "type": "text", "required": false}
                ]'::json,
                'prikaz_perenos_otpuska.docx',
                'Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx'
            ),
            (
                'vacation_extension',
                'Продление отпуска',
                true,
                false,
                'л',
                '[
                    {"key": "vacation_start", "label": "Дата начала отпуска", "type": "date", "required": true},
                    {"key": "vacation_end", "label": "Дата окончания отпуска", "type": "date", "required": true},
                    {"key": "vacation_days", "label": "Количество дней отпуска", "type": "number", "required": true},
                    {"key": "sick_start_date", "label": "Дата начала больничного", "type": "date", "required": true},
                    {"key": "sick_end_date", "label": "Дата окончания больничного", "type": "date", "required": true},
                    {"key": "comment", "label": "Комментарий", "type": "text", "required": false}
                ]'::json,
                'prikaz_prodlenie_otpuska.docx',
                'Приказ_№{order_number}_{order_type_code}_{last_name}_{initials}.docx'
            )
        ON CONFLICT (code) DO NOTHING;
    """)


def downgrade() -> None:
    # Удаляем типы приказов
    op.execute("DELETE FROM order_types WHERE code IN ('vacation_recall', 'vacation_postpone', 'vacation_extension');")
    
    # Удаляем foreign keys
    op.drop_constraint('fk_vacations_extension_order', 'vacations', type_='foreignkey')
    op.drop_constraint('fk_vacations_postpone_order', 'vacations', type_='foreignkey')
    op.drop_constraint('fk_vacations_recall_order', 'vacations', type_='foreignkey')
    
    # Удаляем индексы
    op.drop_index('ix_vacations_is_extended', 'vacations')
    op.drop_index('ix_vacations_is_postponed', 'vacations')
    op.drop_index('ix_vacations_is_recalled', 'vacations')
    
    # Удаляем поля
    op.drop_column('vacations', 'extension_order_id')
    op.drop_column('vacations', 'is_extended')
    op.drop_column('vacations', 'postpone_order_id')
    op.drop_column('vacations', 'is_postponed')
    op.drop_column('vacations', 'recall_order_id')
    op.drop_column('vacations', 'recall_date')
    op.drop_column('vacations', 'is_recalled')
