# ADR-0009: Идемпотентный commit приказа через UNIQUE(source_draft_id)

Дата: 2026-08-10. Статус: принято.

## Контекст

Commit приказа создаёт реальный `Order` из черновика и затем потребляет черновик
(файл + JSON-метаданные). Сегодня единственная гарантия «один черновик → один
приказ» — файловый lock `.commit.lock` (O_EXCL): он защищает от параллельных
commit, но не durable: если процесс умер между INSERT Order и удалением файлов
черновика, lock остаётся, Order существует, а повторный commit навсегда
получает 409. Lock начинает играть роль источника бизнес-состояния, которой
у него нет.

## Решение

`source_draft_id` в `orders` — nullable, `UNIQUE(source_draft_id)` (partial:
только для не-NULL). Это **durable correctness invariant**: для одного source
максимум один Order.

Причинная цепочка гарантий:

- **`UNIQUE(source_draft_id)` обеспечивает correctness** — «один draft →
  максимум один Order», независимо от конкурентности;
- **DB-транзакция обеспечивает атомарность DB-side effects** — `Order`
  и все сопутствующие записи (auto-vacation, `auto_use_days`, dismissal,
  contract history) в одном `async with db.begin()`;
- **cleanup после commit является retryable** — filesystem-потребление
  (`delete_file_only`, идемпотентное `unlink(missing_ok=True)`) выполняется
  после коммита; состояние «Order есть, файлы ещё есть» — легитимный
  retryable cleanup debt;
- **`.commit.lock` — только optimization**: снижает частоту IntegrityError
  и стоимость повторных кликов (O_EXCL дешевле транзакции). Не источник
  истины, отсутствует в correctness proof, снимается идемпотентным cleanup'ом.

Порядок commit:

```
SELECT Order(source_draft_id)         # durable proof первичен
   ├─ found → idempotent cleanup → return existing Order
   └─ absent → claim (оптимизация)
        → TX{ create Order + side effects }      # commit
        → idempotent cleanup draft
        → return Order
```

- При `IntegrityError`: немедленный `rollback()` сессии, затем `SELECT` по
  `source_draft_id` в свежем стейте; найденный Order — успешный concurrent
  commit → cleanup → return. Не найден (READ COMMITTED race: победитель ещё
  не закоммитился) — bounded retry. `SELECT ... FOR UPDATE`/advisory lock —
  не фундамент, только оптимизации.
- **Существующий Order означает успешный commit, а не ошибку duplicate**:
  HTTP возвращает сериализованный Order, без отдельного 409/`was_created`.
  Результат операции одинаков для клиента — «после commit существует этот
  Order». Доменная история попытки — в логи, не в DTO.
- **Consume никогда не переносится до commit**: обратное состояние
  (черновик consumed, Order откачен) — потеря исходных данных. «Order committed,
  файлы временно есть» — корректно.

## Доменная семантика `source_draft_id`

`source_draft_id` — **immutable opaque identifier источника, породившего Order**;
одновременно идемпотентность-ключ commit-пути. Это **не** FK на draft storage
и не обещает обратной разрешимости на существующий черновик (тот consumed).
Direct-create (`POST /orders`) → `NULL`, обычные приказы в идемпотентности
не участвуют. `source_draft_id` устанавливается **только внутренним
commit-адаптером** из верифицированного черновика, не из тела запроса.

`DraftRef(kind, id)` (presentation-identity, ADR-0006) и `source_draft_id`
(durable provenance) — разные концепты; для Order сейчас маппятся 1:1,
намеренно не сливаются. Смена storage/presentation ID не ломает provenance
уже созданных приказов.

## Групповой приказ

Тот же инвариант: один групповой draft → один `Order(is_group=True)` +
полный набор `OrderEmployee` в одной транзакции (all-or-nothing). Любой сбой
до commit → rollback, черновик остаётся ACTIVE и перекоммитяем. Одна ветка
обработки claim-conflict на оба вида (single и group) — никакого особого
правила для группы без доменной необходимости.

## Авторизация replay

Повторный commit авторизуется по **текущей** policy (`authorize(actor,
OrderContext, COMMIT)`) с использованием durable-полей Order
(`source_draft_id`, `source_draft_created_by`, тип приказа, …).
`source_draft_created_by` — вход policy, а не сохранённое `allow=true`;
policy может эволюционировать без миграции старых приказов. Replay не требует
уже уничтоженного черновика для принятия решения. Идемпотентный lookup
выполняется после authorization (не раскрывает чужой Order по `source_draft_id`).

## Почему

`.commit.lock` давал только concurrency-координацию, но не durable-связь
между успешным domain operation и потреблением черновика. `source_draft_id UNIQUE`
+ транзакция + idempotent cleanup дают восстановимость из любого краха по
одному только durable DB-состоянию.

## Последствия

- Миграция Alembic: `orders.source_draft_id` (nullable, partial UNIQUE) +
  `orders.source_draft_created_by` (nullable) — только если policy использует
  создателя черновика.
- `OrderCreate` теряет `draft_id` как публичное входное поле; commit-путь
  передаёт `source_draft_id` как внутренний параметр service-метода.
  **Не реализовано — #94/#95 (T4/T5, OPEN):** сейчас в коде только миграция +
  колонки модели (задача #91); удаление `draft_id` из `OrderCreate` и писатель
  колонок — направление, не факт текущей реализации.
- Обработка `IntegrityError` + rollback + bounded retry в `OrderDraftAdapter`.
  **Не реализовано — #94/#95 (T4/T5, OPEN):** это направление; сегодня
  конкурентный commit полагается на файловый claim (`claim_draft_for_commit`).
- Нарушение уникальности больше не означает «приказ уже создан» как ошибку —
  это успешный результат существующего Order.
