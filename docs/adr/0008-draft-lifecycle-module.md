# ADR-0008: Единый lifecycle-модуль черновиков — application-level polymorphism

Дата: 2026-08-10. Статус: принято.

## Контекст

Lifecycle черновиков (create/finalize/commit/delete) был размазан по
`api/onlyoffice.py` (имя третьей стороны), трём сервисам
(`document_draft_service`, `order_draft_service`, `unified_drafts_service`),
двум twin-механизмам резолва путей (`DraftServiceConfig.path_func` и
config-less `DbDraftDocumentService._resolve_file_path` по `isinstance`)
и фальшивому наследованию `OrderDraftService(DocumentDraftService)` с
нулевой leverage (переопределение `create_draft` целиком, другая сигнатура).

При этом «черновик» у видов семантически разный: у уведомления/заявления это
БД-строка `is_draft=True`, у приказа — файл + JSON-метаданные. Единого
lifecycle-перехода нет (commit приказа создаёт `Order` и потребляет черновик;
commit БД-вида — флип `is_draft`), а `finalize` у БД-видов — это композиция
скачивания файла и коммита, отсутствующая у приказа вовсе.

## Решение

Один deep-модуль черновика с **общим seam на уровне application protocol,
а не на уровне domain state machine**:

```
DraftAdapter                    # общий protocol
    list(actor) → DraftSummary[]
    commit(actor, ref)
    delete_draft(actor, ref)     # «удалить draft», не документ

Специализированные create        # вне общего protocol
    create_order_draft / create_notification_draft / create_statement_draft

Capabilities (только БД-виды)
    download_and_replace(url)
    finalize = download_and_replace + commit     # use-case композиция
```

- **Application-level polymorphism**: интерфейс общий по имени операции,
  семантика перехода полностью принадлежит виду (`commit` — контракт,
  не единая реализация).
- **`create_*` не возвращается в общий `DraftAdapter`** — входы/выходы видов
  радикально различаются (`file_path` vs `notification_id`, pre-loaded объекты
  vs pydantic-data, group-ветка у приказа).
- **`finalize` — не примитив**: `download_and_replace` + `commit`, порядок
  фиксирован, промежуточное состояние `is_draft=True` + новый файл допустимо,
  retry идемпотентен.
- **HTTP остаётся per-kind**: `/orders/drafts/{id}/commit`,
  `/notifications/{id}/commit`, `/statements/{id}/commit` — тонкие роутеры.
  Единого `/drafts/{ref}` в HTTP нет.
- **`DraftRef(kind, id)` — typed value object** на application boundary
  (`DraftRef.order(uuid)`, `DraftRef.notification(id)`, `DraftRef.statement(id)`).
  Строковый wire-format (`"notification:123"`) парсится/сериализуется только
  на presentation boundary; domain/application code префикс не разбирает.
- **`DraftAdapterRegistry`** знает только `kind → adapter`; `load_context` —
  приватная деталь адаптера (для mutating use-case), публичная read-model —
  отдельные query (`get_draft/ form-data`).
- **Authorization** — общая policy capability, но решение принимается внутри
  application use-case непосредственно перед mutation (без TOCTOU-окна
  между `load_context` и `commit`). Replay проверяет текущую policy по durable
  контексту Order, а не сохранённое `allow=true`. **Вне текущей реализации —
  #96 (OPEN):** authz в use-case commit не внедрена, решение остаётся на
  уровне роутера; это направление, не факт.
- **`delete_draft`** — инвариант «работает только пока объект является draft»
  (БД-виды: guard `is_draft=True`, иначе 409). **Вне текущей реализации —
  #98 (OPEN):** `NotificationDraftAdapter.delete_draft` и
  `StatementDraftAdapter.delete_draft` удаляют строку без guard; guard 409 —
  направление, не факт. Удаление документа — отдельный use-case
  `delete_document` со своей авторизацией.

## Почему

Локальность: lifecycle-баги концентрируются в одном модуле; исчезают два
twin-механизма путей, фальшивое наследование и импортный цикл
(`order_document_service` ⇄ `order_draft_service`). Один seam для тестов
вместо трёх роутеров и трёх сервисов. Seam честен: общий только там, где
семантика действительно общая.

## Последствия

- `OrderDraftService(DocumentDraftService)` и `DbDraftDocumentService`
  удаляются; вместо них `OrderDraftAdapter` + специализированные
  application-сервисы create.
- Тонкие per-kind HTTP-роутеры вызывают `DraftApplicationFacade`; роутер
  перестаёт знать про нормализацию vacation/transfer, employee/order_type —
  это уходит в `Create*DraftCommand` / application service.
- `unified_drafts_service` становится читаемым через общий `list(actor)`;
  конструирование строк `f"notification:{id}"` уходит из него в presentation
  serializer.
- Подробности commit-корректности (idempotency, транзакции, cleanup) —
  в ADR-0009.
