# Testing Guide HRMS

## Обзор тестов

В проекте **HRMS** реализовано сквозное тестирование (E2E) с помощью **Playwright**. Тесты разделены на три ключевые области:
1. **UI тесты (`e2e/ui/`)** — проверка интерфейса, форм создания сотрудников, структуры организации.
2. **API тесты (`e2e/api/`)** — проверка эндпоинтов авторизации, отпусков и документов.
3. **Domain тесты (`e2e/domain/`)** — интеграционные сценарии бизнес-логики (например, генерация периодов отпусков).

## Запуск тестов

Для запуска E2E-тестов необходимо поднять тестовое окружение и запустить соответствующую команду:

```bash
# 1. Поднимите тестовое окружение в Docker
npm run docker:test:up

# 2. Дождитесь готовности контейнеров и запустите тесты
# Запуск регрессионного набора тестов
npm run test:e2e:regression

# Запуск только UI-тестов
npm run test:e2e:ui

# Запуск только API-тестов
npm run test:e2e:api

# Запуск дымовых тестов (smoke)
npm run test:e2e:smoke
```

### Параллельный прогон (opt-in)

По умолчанию Playwright работает в serial-режиме (`workers: 1`).  
Multi-worker включается через `PW_WORKERS`; при `workers>1` нужен managed browser (shared CDP несовместим).

```bash
# serial (default)
npm run test:e2e:smoke

# opt-in parallel (managed browser only)
cross-env PW_WORKERS=2 E2E_BROWSER_MODE=managed npm run test:e2e:smoke
```

Имена сущностей, создаваемых через `apiOps`, получают префикс `w{N}-` (worker index) для изоляции данных на shared app DB.

## Backend (pytest)

### Postgres для pytest

Рекомендуемый путь — **dedicated** Postgres (не dev app DB):

| Что | Значение |
|-----|----------|
| Compose | `infra/compose/docker-compose.pytest.yml` (project `hrms-pytest-db`) |
| Контейнер | `hrms-postgres-pytest` |
| Host port | **5436** (`PYTEST_POSTGRES_PORT`, default) |
| User / pass / DB | `hrms_user` / `hrms_pass` / `hrms_test` |
| Env override | `HRMS_TEST_DATABASE_URL` (или `TEST_DATABASE_URL`) |

```bash
npm run test:db:up      # docker compose up -d
npm run test:db:wait    # pg_isready в контейнере
npm run test:db:down    # остановить dedicated DB
```

npm-скрипты `test:pytest*` сами поднимают DB, ждут готовности и выставляют
`HRMS_TEST_DATABASE_URL=postgresql+asyncpg://hrms_user:hrms_pass@localhost:5436/hrms_test`.

Fallback без dedicated compose: default URL в conftest — `localhost:5435`
(dev Postgres `hrms-postgres`), если env не задан. Права **CREATEDB** обязательны
(роль `POSTGRES_USER` в compose их имеет).

### Изоляция

Изоляция (`backend/tests/conftest.py`):
- ephemeral DB `hrms_test_*` на **модуль**;
- per-test cleanup через **`HRMS_TEST_ISOLATION`**:
  | Значение | Поведение | Когда |
  |----------|-----------|--------|
  | `savepoint` (**default**) | outer transaction + nested savepoints; rollback после теста | обычный прогон (быстрее TRUNCATE) |
  | `truncate` | `TRUNCATE ... CASCADE` после теста | debug / сравнение / тесты с реальной видимостью commit |
- маркер `@pytest.mark.requires_truncate` — форс TRUNCATE для одного теста, если savepoint недостаточен.

Параллель: `pytest-xdist` + `--dist=loadfile` (файл целиком на одном worker).

```bash
# через npm (dedicated DB :5436)
npm run test:pytest          # serial -q
npm run test:pytest:fast     # -n auto --dist=loadfile
npm run test:pytest:lf       # --lf

# вручную из backend/ (нужен URL)
cd backend
cross-env HRMS_TEST_DATABASE_URL=postgresql+asyncpg://hrms_user:hrms_pass@localhost:5436/hrms_test python -m pytest -q
cross-env HRMS_TEST_DATABASE_URL=postgresql+asyncpg://hrms_user:hrms_pass@localhost:5436/hrms_test python -m pytest -n auto --dist=loadfile -q
python -m pytest -n 2 --dist=loadfile -q
python -m pytest -q --durations=20

# dual-mode smoke (изоляция)
# default savepoint
python -m pytest tests/test_db_isolation.py -q
# legacy truncate
cross-env HRMS_TEST_ISOLATION=truncate python -m pytest tests/test_db_isolation.py -q
# Windows PowerShell:
# $env:HRMS_TEST_ISOLATION='truncate'; python -m pytest tests/test_db_isolation.py -q
```

### CI (GitHub Actions)

Workflow [`.github/workflows/test-backend.yml`](../.github/workflows/test-backend.yml):
- service `postgres:15` на `:5432`;
- `HRMS_TEST_DATABASE_URL=postgresql+asyncpg://hrms_user:hrms_pass@localhost:5432/hrms_test`;
- `python -m pytest -n auto --dist=loadfile -q` в `backend/`.

## Интеграция с Chrome DevTools (CDP)

Для отладки тестов в реальном браузере через CDP:
1. Запустите Chrome с удаленным отладчиком:
   ```bash
   chrome.exe --remote-debugging-port=9222
   ```
2. Запустите тесты с переменной окружения:
   ```bash
   cross-env E2E_BROWSER_MODE=cdp npm run test:e2e:regression
   ```
   Конфигурация `playwright.config.ts` подключится к порту 9222 и выполнит сценарии на открытой странице.
