"""
Скрипт рефакторинга миграций HRMS.

Переименовывает файлы миграций в директории alembic/versions/ в последовательную
нумерацию (001, 002, ... 034) и обновляет значения revision/down_revision внутри файлов.

После переименования нужно выполнить:
    alembic stamp 034

Использование:
    python scripts/rename_migrations.py              # применить изменения
    python scripts/rename_migrations.py --dry-run   # посмотреть без изменений
"""

import argparse
import re
import shutil
import sys
from pathlib import Path

# ─── Полная цепочка миграций ────────────────────────────────────────────────
# Формат: (старый_файл, старый_revision, старый_down_revision, новый_номер, новый_файл)
MIGRATIONS = [
    ("0001_initial_schema.py",                                                    "0001_initial_schema",         None,                          "001", "001_initial_schema.py"),
    ("0002_order_types_and_decouple_vacations.py",                                "0002_order_types",            "0001_initial_schema",         "002", "002_order_types_and_decouple_vacations.py"),
    ("20260426_0038_0bfab6a26bb5_add_vacation_period_transactions.py",            "0bfab6a26bb5",                "0002_order_types",            "003", "003_add_vacation_period_transactions.py"),
    ("20260426_0203_f88501f31469_add_cascade_delete_to_transactions.py",          "f88501f31469",                "0bfab6a26bb5",                "004", "004_add_cascade_delete_to_transactions.py"),
    ("20260426_2332_9fb0d839a6df_add_letter_to_order_types.py",                   "9fb0d839a6df",                "f88501f31469",                "005", "005_add_letter_to_order_types.py"),
    ("20260430_0140_3c89895478dc_add_staffing_documents.py",                      "3c89895478dc",                "9fb0d839a6df",                "006", "006_add_staffing_documents.py"),
    ("20260430_1530_7a1f2d9c6b4e_normalize_file_storage_paths.py",               "7a1f2d9c6b4e",                "3c89895478dc",                "007", "007_normalize_file_storage_paths.py"),
    ("20260504_0100_add_hire_date_adjustments.py",                                "a1b2c3d4e5f6",                "7a1f2d9c6b4e",                "008", "008_add_hire_date_adjustments.py"),
    ("20260504_0200_rename_staffing_to_documents.py",                             "20260504_0200",               "a1b2c3d4e5f6",                "009", "009_rename_staffing_to_documents.py"),
    ("20260505_0100_add_vacation_recall_fields.py",                               "20260505_0100",               "20260504_0200",               "010", "010_add_vacation_recall_fields.py"),
    ("20260506_0100_add_substitution_order_type.py",                              "add_substitution_order_type", "20260505_0100",               "011", "011_add_substitution_order_type.py"),
    ("20260506_0200_vacation_adjustment_ledger.py",                               "20260506_0200",               "add_substitution_order_type", "012", "012_vacation_adjustment_ledger.py"),
    ("20260507_0100_add_display_name_to_orders_and_types.py",                     "20260507_0100",               "20260506_0200",               "013", "013_add_display_name_to_orders_and_types.py"),
    ("20260507_0200_deduplicate_manual_closure_transactions.py",                  "20260507_0200",               "20260507_0100",               "014", "014_deduplicate_manual_closure_transactions.py"),
    ("20260507_0300_add_cascade_delete_vacation_fks.py",                          "20260507_0300",               "20260507_0200",               "015", "015_add_cascade_delete_vacation_fks.py"),
    ("20260507_0400_add_cascade_delete_order_fks.py",                             "20260507_0400",               "20260507_0300",               "016", "016_add_cascade_delete_order_fks.py"),
    ("20260511_0100_add_employment_type.py",                                      "20260511_0100",               "20260507_0400",               "017", "017_add_employment_type.py"),
    ("20260511_0200_add_group_orders.py",                                         "20260511_0200",               "20260511_0100",               "018", "018_add_group_orders.py"),
    ("0002_rename_archived_to_dismissed.py",                                      "rename_archived_to_dismissed","20260511_0200",               "019", "019_rename_archived_to_dismissed.py"),
    ("20260512_0100_add_vacation_unpaid_group_order_type.py",                     "20260512_0100",               "rename_archived_to_dismissed","020", "020_add_vacation_unpaid_group_order_type.py"),
    ("20260512_0200_normalize_document_file_paths.py",                            "20260512_0200",               "20260512_0100",               "021", "021_normalize_document_file_paths.py"),
    ("20260512_0300_fix_vacation_calendar_paths.py",                              "20260512_0300",               "20260512_0200",               "022", "022_fix_vacation_calendar_paths.py"),
    ("20260516_0100_remove_is_cancelled_fields.py",                               "20260516_0100",               "20260512_0300",               "023", "023_remove_is_cancelled_fields.py"),
    ("20260516_0200_remove_sick_leave_cancelled_status.py",                       "20260516_0200",               "20260516_0100",               "024", "024_remove_sick_leave_cancelled_status.py"),
    ("20260516_0300_restore_manual_closures_for_orphan_transactions.py",          "20260516_0300",               "20260516_0200",               "025", "025_restore_manual_closures_for_orphan_transactions.py"),
    ("20260516_0400_add_transfers_column.py",                                     "20260516_0400",               "20260516_0300",               "026", "026_add_transfers_column.py"),
    ("20260518_0100_add_edited_at_to_documents.py",                               "20260518_0100",               "20260516_0400",               "027", "027_add_edited_at_to_documents.py"),
    ("20260518_0200_add_notifications_and_statements.py",                         "20260518_0200",               "20260518_0100",               "028", "028_add_notifications_and_statements.py"),
    ("20260519_0100_add_statement_notification_types.py",                         "20260519_0100",               "20260518_0200",               "029", "029_add_statement_notification_types.py"),
    ("20260601_0100_add_contract_history.py",                                     "20260601_0100",               "20260519_0100",               "030", "030_add_contract_history.py"),
    ("20260601_0200_add_contract_number_and_populate_history.py",                 "20260601_0200",               "20260601_0100",               "031", "031_add_contract_number_and_populate_history.py"),
    ("20260602_0719_308e1d51d6f2_add_position_fields_to_contract_history.py",    "308e1d51d6f2",                "20260601_0200",               "032", "032_add_position_fields_to_contract_history.py"),
    ("20260616_0100_add_employee_id_to_users.py",                                 "20260616_0100",               "308e1d51d6f2",                "033", "033_add_employee_id_to_users.py"),
    ("20260617_0100_update_user_roles.py",                                        "20260617_0100",               "20260616_0100",               "034", "034_update_user_roles.py"),
]

# Маппинг: старый_revision -> новый_revision
OLD_TO_NEW: dict[str, str] = {m[1]: m[3] for m in MIGRATIONS}
HEAD_REVISION = MIGRATIONS[-1][3]      # "034"
OLD_HEAD_REVISION = MIGRATIONS[-1][1]  # "20260617_0100"


def update_file_content(content: str, old_rev: str, new_rev: str, old_down: str | None) -> str:
    """Заменяет revision и down_revision в тексте файла миграции."""
    new_down = OLD_TO_NEW.get(old_down) if old_down else None

    # revision (поддерживаем одинарные/двойные кавычки и аннотацию типа)
    content = re.sub(
        r"(revision\s*(?::\s*str\s*)?=\s*)['\"]" + re.escape(old_rev) + r"['\"]",
        r"\g<1>'" + new_rev + "'",
        content,
    )

    # down_revision
    if old_down and new_down:
        content = re.sub(
            r"(down_revision\s*(?::\s*Union\[str,\s*None\]\s*)?(?::\s*str\s*)?=\s*)['\"]"
            + re.escape(old_down)
            + r"['\"]",
            r"\g<1>'" + new_down + "'",
            content,
        )

    # Docstring: «Revision ID: ...»
    content = re.sub(
        r"(Revision ID:\s*)" + re.escape(old_rev),
        r"\g<1>" + new_rev,
        content,
    )

    # Docstring: «Revises: ...»  (может содержать slug после revision_id)
    if old_down:
        new_down_str = OLD_TO_NEW.get(old_down) or old_down
        content = re.sub(
            r"(Revises:\s*)" + re.escape(old_down) + r"(?:_[a-zA-Z]\S*)?",
            r"\g<1>" + new_down_str,
            content,
        )

    return content


def main(dry_run: bool = False) -> None:
    base_dir = Path(__file__).parent.parent
    versions_dir = base_dir / "alembic" / "versions"

    if not versions_dir.exists():
        print(f"[ERROR] Директория не найдена: {versions_dir}", file=sys.stderr)
        sys.exit(1)

    prefix = "[DRY RUN] " if dry_run else ""
    print(f"{prefix}Рефакторинг миграций в {versions_dir}\n")

    # Удаляем __pycache__ (иначе Python может подхватить старые .pyc)
    pycache = versions_dir / "__pycache__"
    if pycache.exists():
        if dry_run:
            print(f"  {prefix}Удалить {pycache}")
        else:
            shutil.rmtree(pycache)
            print(f"  ✓ Удалён {pycache}")

    errors: list[str] = []

    for old_filename, old_rev, old_down, new_num, new_filename in MIGRATIONS:
        old_path = versions_dir / old_filename
        new_path = versions_dir / new_filename

        # Повторный запуск — уже переименовано
        if not old_path.exists():
            if new_path.exists():
                print(f"  ↷  Уже готово: {new_filename}")
                continue
            errors.append(old_filename)
            print(f"  ✗  Файл не найден: {old_filename}")
            continue

        try:
            content = old_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = old_path.read_text(encoding="cp1251")

        updated = update_file_content(content, old_rev, new_num, old_down)

        if dry_run:
            old_down_display = f"'{old_down}'" if old_down else "None"
            _new_down = OLD_TO_NEW.get(old_down) if old_down else None
            new_down_display = f"'{_new_down}'" if _new_down else "None"
            print(
                f"  {old_filename}\n"
                f"    -> файл:           {new_filename}\n"
                f"    -> revision:       '{old_rev}' -> '{new_num}'\n"
                f"    -> down_revision:  {old_down_display} -> {new_down_display}\n"
            )
        else:
            new_path.write_text(updated, encoding="utf-8")
            if old_path != new_path:
                old_path.unlink()
            print(f"  ✓  {old_filename!s:80s} → {new_filename}")

    # Итог
    print()
    if errors:
        print(f"⚠️  Не найдено файлов ({len(errors)}):")
        for e in errors:
            print(f"     - {e}")
        sys.exit(1)

    if dry_run:
        print("--- Dry run completed. Run without --dry-run to apply ---")
    else:
        print("✅ Все файлы переименованы.\n")
        print("Следующий шаг — обновить alembic_version в локальной БД:")
        print(f"  .venv\\Scripts\\alembic stamp {HEAD_REVISION}")
        print()
        print("На продакшен-сервере перед деплоем выполни:")
        print(f"  alembic stamp {HEAD_REVISION}")
        print("  (или запусти scripts/migrate_production_version.py)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Рефакторинг миграций HRMS: приведение к нумерации 001-034"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Показать что будет сделано без фактических изменений",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run)
"""
Скрипт рефакторинга миграций HRMS.

Переименовывает файлы миграций в директории alembic/versions/ в последовательную
нумерацию (001, 002, ... 034) и обновляет значения revision/down_revision внутри файлов.

После переименования нужно выполнить:
    alembic stamp 034

Использование:
    python scripts/rename_migrations.py              # применить изменения
    python scripts/rename_migrations.py --dry-run   # посмотреть без изменений
"""

import argparse
import re
import shutil
import sys
from pathlib import Path

# ─── Полная цепочка миграций ────────────────────────────────────────────────
# Формат: (старый_файл, старый_revision, старый_down_revision, новый_номер, новый_файл)
MIGRATIONS = [
    ("0001_initial_schema.py",                                                    "0001_initial_schema",         None,                          "001", "001_initial_schema.py"),
    ("0002_order_types_and_decouple_vacations.py",                                "0002_order_types",            "0001_initial_schema",         "002", "002_order_types_and_decouple_vacations.py"),
    ("20260426_0038_0bfab6a26bb5_add_vacation_period_transactions.py",            "0bfab6a26bb5",                "0002_order_types",            "003", "003_add_vacation_period_transactions.py"),
    ("20260426_0203_f88501f31469_add_cascade_delete_to_transactions.py",          "f88501f31469",                "0bfab6a26bb5",                "004", "004_add_cascade_delete_to_transactions.py"),
    ("20260426_2332_9fb0d839a6df_add_letter_to_order_types.py",                   "9fb0d839a6df",                "f88501f31469",                "005", "005_add_letter_to_order_types.py"),
    ("20260430_0140_3c89895478dc_add_staffing_documents.py",                      "3c89895478dc",                "9fb0d839a6df",                "006", "006_add_staffing_documents.py"),
    ("20260430_1530_7a1f2d9c6b4e_normalize_file_storage_paths.py",               "7a1f2d9c6b4e",                "3c89895478dc",                "007", "007_normalize_file_storage_paths.py"),
    ("20260504_0100_add_hire_date_adjustments.py",                                "a1b2c3d4e5f6",                "7a1f2d9c6b4e",                "008", "008_add_hire_date_adjustments.py"),
    ("20260504_0200_rename_staffing_to_documents.py",                             "20260504_0200",               "a1b2c3d4e5f6",                "009", "009_rename_staffing_to_documents.py"),
    ("20260505_0100_add_vacation_recall_fields.py",                               "20260505_0100",               "20260504_0200",               "010", "010_add_vacation_recall_fields.py"),
    ("20260506_0100_add_substitution_order_type.py",                              "add_substitution_order_type", "20260505_0100",               "011", "011_add_substitution_order_type.py"),
    ("20260506_0200_vacation_adjustment_ledger.py",                               "20260506_0200",               "add_substitution_order_type", "012", "012_vacation_adjustment_ledger.py"),
    ("20260507_0100_add_display_name_to_orders_and_types.py",                     "20260507_0100",               "20260506_0200",               "013", "013_add_display_name_to_orders_and_types.py"),
    ("20260507_0200_deduplicate_manual_closure_transactions.py",                  "20260507_0200",               "20260507_0100",               "014", "014_deduplicate_manual_closure_transactions.py"),
    ("20260507_0300_add_cascade_delete_vacation_fks.py",                          "20260507_0300",               "20260507_0200",               "015", "015_add_cascade_delete_vacation_fks.py"),
    ("20260507_0400_add_cascade_delete_order_fks.py",                             "20260507_0400",               "20260507_0300",               "016", "016_add_cascade_delete_order_fks.py"),
    ("20260511_0100_add_employment_type.py",                                      "20260511_0100",               "20260507_0400",               "017", "017_add_employment_type.py"),
    ("20260511_0200_add_group_orders.py",                                         "20260511_0200",               "20260511_0100",               "018", "018_add_group_orders.py"),
    ("0002_rename_archived_to_dismissed.py",                                      "rename_archived_to_dismissed","20260511_0200",               "019", "019_rename_archived_to_dismissed.py"),
    ("20260512_0100_add_vacation_unpaid_group_order_type.py",                     "20260512_0100",               "rename_archived_to_dismissed","020", "020_add_vacation_unpaid_group_order_type.py"),
    ("20260512_0200_normalize_document_file_paths.py",                            "20260512_0200",               "20260512_0100",               "021", "021_normalize_document_file_paths.py"),
    ("20260512_0300_fix_vacation_calendar_paths.py",                              "20260512_0300",               "20260512_0200",               "022", "022_fix_vacation_calendar_paths.py"),
    ("20260516_0100_remove_is_cancelled_fields.py",                               "20260516_0100",               "20260512_0300",               "023", "023_remove_is_cancelled_fields.py"),
    ("20260516_0200_remove_sick_leave_cancelled_status.py",                       "20260516_0200",               "20260516_0100",               "024", "024_remove_sick_leave_cancelled_status.py"),
    ("20260516_0300_restore_manual_closures_for_orphan_transactions.py",          "20260516_0300",               "20260516_0200",               "025", "025_restore_manual_closures_for_orphan_transactions.py"),
    ("20260516_0400_add_transfers_column.py",                                     "20260516_0400",               "20260516_0300",               "026", "026_add_transfers_column.py"),
    ("20260518_0100_add_edited_at_to_documents.py",                               "20260518_0100",               "20260516_0400",               "027", "027_add_edited_at_to_documents.py"),
    ("20260518_0200_add_notifications_and_statements.py",                         "20260518_0200",               "20260518_0100",               "028", "028_add_notifications_and_statements.py"),
    ("20260519_0100_add_statement_notification_types.py",                         "20260519_0100",               "20260518_0200",               "029", "029_add_statement_notification_types.py"),
    ("20260601_0100_add_contract_history.py",                                     "20260601_0100",               "20260519_0100",               "030", "030_add_contract_history.py"),
    ("20260601_0200_add_contract_number_and_populate_history.py",                 "20260601_0200",               "20260601_0100",               "031", "031_add_contract_number_and_populate_history.py"),
    ("20260602_0719_308e1d51d6f2_add_position_fields_to_contract_history.py",    "308e1d51d6f2",                "20260601_0200",               "032", "032_add_position_fields_to_contract_history.py"),
    ("20260616_0100_add_employee_id_to_users.py",                                 "20260616_0100",               "308e1d51d6f2",                "033", "033_add_employee_id_to_users.py"),
    ("20260617_0100_update_user_roles.py",                                        "20260617_0100",               "20260616_0100",               "034", "034_update_user_roles.py"),
]

# Маппинг: старый_revision -> новый_revision
OLD_TO_NEW: dict[str, str] = {m[1]: m[2] for m in MIGRATIONS}
HEAD_REVISION = MIGRATIONS[-1][2]      # "034"
OLD_HEAD_REVISION = MIGRATIONS[-1][1]  # "20260617_0100"


def update_file_content(content: str, old_rev: str, new_rev: str, old_down: str | None) -> str:
    """Заменяет revision и down_revision в тексте файла миграции."""
    new_down = OLD_TO_NEW.get(old_down) if old_down else None

    # revision (поддерживаем одинарные/двойные кавычки и аннотацию типа)
    content = re.sub(
        r"(revision\s*(?::\s*str\s*)?=\s*)['\"]" + re.escape(old_rev) + r"['\"]",
        r"\g<1>'" + new_rev + "'",
        content,
    )

    # down_revision
    if old_down and new_down:
        content = re.sub(
            r"(down_revision\s*(?::\s*Union\[str,\s*None\]\s*)?(?::\s*str\s*)?=\s*)['\"]"
            + re.escape(old_down)
            + r"['\"]",
            r"\g<1>'" + new_down + "'",
            content,
        )

    # Docstring: «Revision ID: ...»
    content = re.sub(
        r"(Revision ID:\s*)" + re.escape(old_rev),
        r"\g<1>" + new_rev,
        content,
    )

    # Docstring: «Revises: ...»
    if old_down:
        new_down_str = OLD_TO_NEW.get(old_down) or old_down
        content = re.sub(
            r"(Revises:\s*)" + re.escape(old_down),
            r"\g<1>" + new_down_str,
            content,
        )

    return content


def main(dry_run: bool = False) -> None:
    base_dir = Path(__file__).parent.parent
    versions_dir = base_dir / "alembic" / "versions"

    if not versions_dir.exists():
        print(f"[ERROR] Директория не найдена: {versions_dir}", file=sys.stderr)
        sys.exit(1)

    prefix = "[DRY RUN] " if dry_run else ""
    print(f"{prefix}Рефакторинг миграций в {versions_dir}\n")

    # Удаляем __pycache__ (иначе Python может подхватить старые .pyc)
    pycache = versions_dir / "__pycache__"
    if pycache.exists():
        if dry_run:
            print(f"  {prefix}Удалить {pycache}")
        else:
            shutil.rmtree(pycache)
            print(f"  ✓ Удалён {pycache}")

    errors: list[str] = []

    for old_filename, old_rev, old_down, new_num, new_filename in MIGRATIONS:
        old_path = versions_dir / old_filename
        new_path = versions_dir / new_filename

        # Повторный запуск — уже переименовано
        if not old_path.exists():
            if new_path.exists():
                print(f"  ↷  Уже готово: {new_filename}")
                continue
            errors.append(old_filename)
            print(f"  ✗  Файл не найден: {old_filename}")
            continue

        try:
            content = old_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = old_path.read_text(encoding="cp1251")

        updated = update_file_content(content, old_rev, new_num, old_down)

        if dry_run:
            old_down_display = f"'{old_down}'" if old_down else "None"
            _new_down = OLD_TO_NEW.get(old_down) if old_down else None
            new_down_display = f"'{_new_down}'" if _new_down else "None"
            print(
                f"  {old_filename}\n"
                f"    -> файл:           {new_filename}\n"
                f"    -> revision:       '{old_rev}' -> '{new_num}'\n"
                f"    -> down_revision:  {old_down_display} -> {new_down_display}\n"
            )
        else:
            new_path.write_text(updated, encoding="utf-8")
            if old_path != new_path:
                old_path.unlink()
            print(f"  ✓  {old_filename!s:80s} → {new_filename}")

    # Итог
    print()
    if errors:
        print(f"⚠️  Не найдено файлов ({len(errors)}):")
        for e in errors:
            print(f"     - {e}")
        sys.exit(1)

    if dry_run:
        print("--- Dry run completed. Run without --dry-run to apply ---")
    else:
        print("✅ Все файлы переименованы.\n")
        print("Следующий шаг — обновить alembic_version в локальной БД:")
        print(f"  .venv\\Scripts\\alembic stamp {HEAD_REVISION}")
        print()
        print("На продакшен-сервере перед деплоем выполни:")
        print(f"  alembic stamp {HEAD_REVISION}")
        print("  (или запусти scripts/migrate_production_version.py)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Рефакторинг миграций HRMS: приведение к нумерации 001-034"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Показать что будет сделано без фактических изменений",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run)
