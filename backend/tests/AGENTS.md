# Backend Tests (pytest)

Канон pytest в HRMS. Стек: **pytest**, **pytest-asyncio**, **pytest-xdist**.

## Модель изоляции (run-DB + module schema)

Единственная точка входа — launcher `scripts/test-run.ps1`, который **владеет
жизненным циклом run-DB**:

1. Генерирует `RUN_ID` (12 hex), создаёт **`hrms_test_<runid>`**, выставляет
   `TEST_RUN_ID` / `TEST_DB_NAME` / `TEST_DATABASE_URL`.
2. Запускает pytest и в `finally` **гарантированно** дропает только свою БД.

Несколько агентов могут гонять тесты параллельно: каждый прогон создаёт,
использует и дропает **только свою** БД. `conftest.py` run-DB **не создаёт и
не удаляет** — только подключается, как дал launcher.

> При нескольких параллельных агентах задавайте `PYTEST_NUM_WORKERS`
> (например `4`) — иначе каждый `-n auto` захватит все ядра. PostgreSQL —
> общая инфраструктура; `test:db:down` из launcher не вызывается.

Внутри run-DB:

1. **Схема на модуль**: `t_<uuid8>` на каждый тест-модуль,
   `Base.metadata.create_all()` в ней. Схема **не дропается** в run-DB
   (run-DB целиком дропается launcher'ом; per-module `DROP SCHEMA CASCADE`
   добавлял бы ~0.25s × модуль без выгоды). В ручном режиме на статичной
   `hrms_test` схема дропается в teardown, чтобы не копилась.
2. **Изоляция на тест** (`function scope`): внешняя транзакция + SAVEPOINT;
   на teardown — `rollback`. `HRMS_TEST_ISOLATION=truncate` — `TRUNCATE ... CASCADE`.

### Контракт `TEST_DATABASE_URL`

- **Установлен (launcher)**: имя БД обязано матчить `^hrms_test_[0-9a-f]{12}$`,
  иначе pytest не стартует.
- **Не установлен (ручная отладка)**: только **serial** pytest на статичной
  `hrms_test`; параллельный `pytest -n auto` без launcher — ошибка.

### CI

GHA job-контейнер postgres эфемерный (свой на каждый job), поэтому CI создаёт
run-DB сам, без PowerShell-launcher: `scripts/test-db.py create hrms_test_0c0ffeec0dec`
(фиксированный 12-hex id безопасен на свежем контейнере), выставляет
`TEST_DATABASE_URL` и дропает run-DB в шаге `if: always()`
(см. `.github/workflows/test-backend.yml`).

### Orphan cleanup

Run-DB, осиротевшие из-за убитого прогона, убирает отдельная команда
(`npm run test:db:cleanup`, TTL 24h). Старые per-module БД — одноразовый
`npm run test:db:cleanup-legacy` (dry-run → `--apply`). В прогоне cleanup
не вызывается.

Канонические файлы: [`conftest.py`](conftest.py), [`scripts/test-run.ps1`](../../scripts/test-run.ps1),
[`scripts/test-db.py`](../../scripts/test-db.py).

## Правила написания тестов

- **НЕ рассчитывайте на ID** — не завязывайтесь на `id = 1, 2, 3`; читайте `employee.id`, `order.id` из ответа.
- **Коммит внутри теста** — `session.commit()` коммитит только nested savepoint, не нарушает изоляцию.
- **Не используйте module-scope сессии** — всегда `scope="module"` движок и per-test `db_session`.
- API-тесты — через ASGI-клиент с override `get_db` на `db_session` (см. `test_invite_auth.py`).

## Команды (канон)

| Команда | Что делает |
|---------|------------|
| `npm run test:pytest` | параллельно (launcher, изолированная run-DB) |
| `npm run test:pytest:fast` | то же, что `test:pytest` |
| `npm run test:pytest:full` | тот же suite serial |
| `npm run test:pytest:lf` | только упавшие тесты (last-failed) |
| `npm run test:db:cleanup` | уборка orphan run-DB по TTL (24h) |
| `npm run test:db:cleanup-legacy` | одноразовая уборка старых per-module БД |

Отдельный тест — через launcher (изолированная БД):
`npm run test:pytest -- -k db_isolation`

Отдельный тест без изоляции (serial, общая статичная БД, только отладка):

```bash
npm run test:db:up        # общая инфраструктура (статичная hrms_test на :5436)
cd backend
pytest -v -k db_isolation
pytest tests/test_db_isolation.py::test_isolation_creates_department -v
```

> [!WARNING]
> На Windows не используйте конвейер `2>&1 | head` — поток `2` может быть
> заперт pytest для всего прогона. Сохраняйте в файл:
> `pytest tests/ -v > out.txt 2>&1`.

Конфигурация: `backend/pytest.ini` (`asyncio_mode = auto`, `--durations=20`).
