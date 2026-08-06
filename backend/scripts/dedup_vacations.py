"""Одноразовый скрипт дедупликации отпусков (#65).

Находит группы отпусков с одинаковыми (order_id, employee_id) и count > 1,
оставляет в каждой группе одну строку (со ссылками, иначе — с наибольшим id)
и по флагу --apply удаляет остальные. По умолчанию — dry-run (ничего не меняет).

Идемпотентен: повторный прогон не находит групп → «0 групп».

Fail-safe: если ссылки (vacation_period_transactions / vacation_adjustments)
есть в нескольких строках группы, скрипт останавливается с перечнем таких групп,
ничего не удаляя (даже с --apply).

Подключение к БД — из окружения (ENV_FILE, например .env.test/.env.prod,
или DATABASE_URL). Пример:

    cd backend
    python -m scripts.dedup_vacations                  # dry-run
    python -m scripts.dedup_vacations --apply          # реальное удаление

ВНИМАНИЕ: перед --apply на боевой БД сделайте резервную копию.
"""
import argparse
import asyncio
import sys

from app.core.database import get_db
from app.services.vacation_dedup_service import deduplicate_vacations


def _print_report(report, apply: bool) -> None:
    if apply:
        print("\n=== РЕЖИМ: APPLY (реальное удаление) ===\n")
    else:
        print("\n=== РЕЖИМ: DRY-RUN (ничего не изменено) ===\n")

    if report.ambiguous:
        print("ABORT: найдены группы с ссылками в нескольких строках — изменения не выполняются.")
        for info in report.ambiguous:
            print(f"  - order_id={info['order_id']}, employee_id={info['employee_id']}")
        return

    print(f"Групп с дублями (order_id, employee_id): {len(report.groups)}")
    for info in report.groups:
        print(
            f"  order_id={info['order_id']} (приказ №{info['order_number'] or '—'}), "
            f"employee_id={info['employee_id']} ({info['employee_name'] or '—'}): "
            f"строк {len(info['vacation_ids'])}, оставить id={info['keeper_id']}, "
            f"удалить id={info['to_delete_ids']}"
        )

    if report.aborted:
        print(f"\nИтог: ABORTED ({len(report.ambiguous)} неоднозначных групп), удалено: 0, оставлено: 0")
        return

    print(f"\nИтог: групп={len(report.groups)}, удалено: {report.deleted}, оставлено: {report.kept}")
    if not apply:
        print("Повторите с флагом --apply, чтобы выполнить удаление.")


async def _main(apply: bool) -> int:
    async for db in get_db():
        try:
            report = await deduplicate_vacations(db, apply=apply)
            _print_report(report, apply)
            return 1 if report.aborted else 0
        except Exception as exc:  # noqa: BLE001 — скрипт обязан сообщить об ошибке
            import traceback
            traceback.print_exc()
            print(f"\n✗ ОШИБКА: {exc}")
            await db.rollback()
            return 2
        finally:
            await db.close()
            break
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Дедупликация отпусков (dry-run по умолчанию)")
    parser.add_argument("--apply", action="store_true", help="выполнить реальное удаление дублей")
    args = parser.parse_args()

    sys.exit(asyncio.run(_main(apply=args.apply)))
