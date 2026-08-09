# Testing Guide HRMS

## Обзор тестов

В проекте **HRMS** — E2E на **Playwright**. Один канонический suite (E4 cutover: legacy удалён).

**Канон:** [`e2e/AGENTS.md`](../e2e/AGENTS.md) (слои, cleanup, selectors, auth, npm-скрипты).

| Набор | Где | Команда | Для чего |
|-------|-----|---------|----------|
| **Smoke** | tag `@smoke` | `npm run test:e2e:smoke` | быстрый gate (core pages / happy-path) |
| **API** | `e2e/api/` + tag `@api` | `npm run test:e2e:api` | HTTP-контракты, без кликов |
| **UI** | tag `@ui` | `npm run test:e2e:ui` | **клики / формы / POM — контроль процесса** |
| **Auth** | `e2e/auth/` | `npm run test:e2e:auth` | login без preloaded storage |
| **Regression** | setup + smoke + ui + api + auth | `npm run test:e2e:regression` | полный локальный прогон |
| **Все projects** | — | `npm run test:e2e` | все projects config |

## Cleanup policy (кратко)

Каждый create → **track** → teardown **delete**; prefix `e2e-`. Create without track = bug. **Нет** wipe всей БД; residual только после crash.

## Запуск тестов

```bash
# 1. Тестовое окружение (или DEV: npm run dev)
npm run docker:test:up

# 2. Слои
npm run test:e2e:smoke
npm run test:e2e:api
npm run test:e2e:ui
npm run test:e2e:auth
npm run test:e2e:regression

# Список без запуска
npx playwright test --list
```

### Параллельный прогон (opt-in)

По умолчанию Playwright: **`workers: 1`**, `fullyParallel: false` (serial — контроль / debug).  
Multi-worker — **opt-in** через `PW_WORKERS` + **`E2E_BROWSER_MODE=managed`** (Playwright сам поднимает Chromium на worker).  
`E2E_BROWSER_MODE=cdp` + `PW_WORKERS>1` → **fail-fast** (shared CDP не обслуживает несколько workers).  
**CI e2e-smoke остаётся на workers: 1** (не задавать `PW_WORKERS` в workflow).

```bash
# serial (default) — контроль / debug
npm run test:e2e:ui
npm run test:e2e:smoke

# parallel opt-in (local; file-level, workers: 2)
npm run test:e2e:smoke:parallel
npm run test:e2e:ui:parallel
# optional: test-level parallel (PW_FULLY_PARALLEL=1) — riskier for OnlyOffice popups
```

Изоляция данных: `apiOps.uid()` → prefix `w{N}-` (`workerPrefix(parallelIndex)`), сущности `e2e-…`.  
Default multi-worker: **parallel by file** (`fullyParallel: false`); tests inside a file stay serial.

## Покрытие E2E (карта specs)

Канон написания тестов: **[e2e/AGENTS.md](../e2e/AGENTS.md)** (слои, cleanup, selectors, npm-скрипты).

| Project | Содержание |
|---------|------------|
| **setup** | admin login → storageState |
| **auth** | valid login + bad password (без storage) |
| **api** | catalog, errors, timesheet, vacation balance/periods smoke, order-type letter |
| **smoke** | nav, structure, employees CRUD, orders list shell, timesheet open, vacations happy |
| **ui** | structure/employees lifecycle, vacations/plan/add-days, absences, timesheet deeper, **orders OO** (create, hire/dismissal, edit-docx, group-drafts, other types), **import**, **settings** (users, holidays), **vacation adjustment tabs**, **notifications/statements**, **templates** smoke |

### OnlyOffice (важный сценарий)

`e2e/ui/order-onlyoffice-create.spec.ts` (+ hire/dismissal, other types, edit-docx, group-drafts):

```text
API: seed employee
→ UI /orders: выбрать сотрудника + тип (transfer) + номер
→ «Создать приказ» → popup draft /edit-docx
→ OnlyOffice + «Сохранить приказ» (forcesave + commit)
→ проверка в реестре / API
→ cleanup
```

Нужно для прогона: FE `:5171`, BE `:8000`, OnlyOffice DS (dev: `:8085`).

### Backlog / техдолг

| # | Долг | Статус |
|---|------|--------|
| 1 | Backups restore | open — destructive; backend tests |
| 2 | Dashboard deep | open — shallow optional |
| 3 | Multi-worker full **ui** suite | ✅ `npm run test:e2e:ui:parallel` |
| 4 | CI full **ui** + OnlyOffice job | ✅ `.github/workflows/e2e-ui-nightly.yml` |

## Backend (pytest)

### Postgres для pytest

PostgreSQL — **общая инфраструктура**, живёт независимо от тестового прогона:

| Что | Значение |
|-----|----------|
| Compose | `infra/compose/docker-compose.pytest.yml` (project `hrms-pytest-db`) |
| Контейнер | `hrms-postgres-pytest` |
| Host port | **5436** (`PYTEST_POSTGRES_PORT`, default; loopback `127.0.0.1` + `[::1]`) |
| User / pass / admin DB | `hrms_user` / `hrms_pass` / `postgres` |
| Статичная shared БД | `hrms_test` (для ручного serial-режима) |

```bash
npm run test:db:up      # docker compose up -d (общая инфраструктура)
npm run test:db:wait    # pg_isready в контейнере
npm run test:db:down    # остановить dedicated DB (вручную, НЕ из launcher)
npm run test:db:cleanup # orphan run-DB по TTL (24h) — после убитых прогонов
npm run test:db:cleanup-legacy  # одноразовая уборка старых per-module БД (dry-run → --apply)
```

### Изоляция — свойство команды (launcher)

`npm run test:pytest` — единственная точка входа. `scripts/test-run.ps1`
(launcher) генерирует `RUN_ID` (12 hex), создаёт эфемерную БД
`hrms_test_<runid>`, выставляет `TEST_RUN_ID` / `TEST_DB_NAME` /
`TEST_DATABASE_URL` и в `finally` **гарантированно** дропает только свою БД.
Несколько агентов могут гонять тесты параллельно — прогоны не пересекаются и
не дропают чужие БД. Подробности: [ADR-0005](adr/0005-test-db-per-run-launcher.md).

`backend/tests/conftest.py` run-DB **не создаёт и не удаляет** — только
подключается и изолирует схемы `t_<uuid8>` на модуль:
- schema `t_<uuid8>` на **модуль** внутри одной run-DB; `DROP SCHEMA` в teardown;
- per-test cleanup через **`HRMS_TEST_ISOLATION`**:
  | Значение | Поведение | Когда |
  |----------|-----------|--------|
  | `savepoint` (**default**) | outer transaction + nested savepoints; rollback после теста | обычный прогон (быстрее TRUNCATE) |
  | `truncate` | `TRUNCATE ... CASCADE` после теста | debug / сравнение / тесты с реальной видимостью commit |
- маркер `@pytest.mark.requires_truncate` — форс TRUNCATE для одного теста, если savepoint недостаточен.

Параллель: launcher запускает `pytest-xdist` + `--dist=loadfile`
(файл целиком на одном worker — схема модуля живёт в одном worker).

```bash
# через launcher (isolated run-DB :5436)
npm run test:pytest          # -n auto --dist=loadfile
npm run test:pytest:fast     # то же
npm run test:pytest:full     # serial -q
npm run test:pytest:lf       # --lf
npm run test:pytest -- -k db_isolation   # pass-through pytest args

# при нескольких параллельных агентах ограничьте workers:
PYTEST_NUM_WORKERS=4 npm run test:pytest

# ручная отладка (serial, общая статичная БД hrms_test, БЕЗ изоляции run-DB):
# параллельный pytest -n без launcher — ошибка (fail-fast).
npm run test:db:up      # общая инфраструктура должна быть поднята
cd backend
python -m pytest -q --durations=20
python -m pytest tests/test_db_isolation.py -q
# truncate mode:
$env:HRMS_TEST_ISOLATION='truncate'; python -m pytest tests/test_db_isolation.py -q
```

### CI (GitHub Actions)

#### Backend pytest

Workflow [`.github/workflows/test-backend.yml`](../.github/workflows/test-backend.yml):
- service `postgres:15` на `:5432`;
- создание isolated run-DB через `python scripts/test-db.py create hrms_test_0c0ffeec0dec`
  (свежий контейнер на job → фиксированный run-id безопасен);
- `TEST_DATABASE_URL=postgresql+asyncpg://hrms_user:hrms_pass@localhost:5432/hrms_test_0c0ffeec0dec`;
- `python -m pytest -n auto --dist=loadfile -q` в `backend/`;
- cleanup run-DB в шаге `if: always()`.

#### E2E smoke (Playwright)

Workflow [`.github/workflows/e2e-smoke.yml`](../.github/workflows/e2e-smoke.yml):

| | |
|--|--|
| **Triggers** | `workflow_dispatch`, `pull_request`, `push` → `main` / `master` / `feat/e2e-rewrite` |
| **Command** | `npx playwright test --project=setup --project=smoke` (`workers: 1`) |
| **Stack** | GHA `postgres:15` → alembic migrate → seed `admin` → uvicorn `:8000` → Playwright `webServer` (Vite `:5171`) |
| **Credentials** | `E2E_ADMIN_USERNAME=admin` / `E2E_ADMIN_PASSWORD=dev` — login через break-glass (`BREAK_GLASS_ENABLED=true`, `BREAK_GLASS_PASSWORD=dev`) |
| **PR policy** | **best-effort** (`continue-on-error: true` on `pull_request`) — flaky full stack must not block merge until green is proven on GHA |
| **Manual** | Actions → **e2e-smoke** → **Run workflow** (hard-fail for debugging) |
| **Artifacts** | on failure: `playwright-report/` + `test-results/` (7 days) |

**CI knobs** (`playwright.config.ts`): `forbidOnly`, `retries: 2` (CI), `workers: 1`, `reuseExistingServer: !CI`, HTML reporter in CI.

#### E2E UI nightly + OnlyOffice

Workflow [`.github/workflows/e2e-ui-nightly.yml`](../.github/workflows/e2e-ui-nightly.yml):

| | |
|--|--|
| **Triggers** | `schedule` (daily 03:15 UTC), `workflow_dispatch` |
| **Command** | `npx playwright test --project=setup --project=smoke --project=ui` (`workers: 1`) |
| **Stack** | postgres service + OnlyOffice Document Server docker `:8085` + uvicorn + Vite |
| **OO env** | `ONLYOFFICE_ENABLED=true`, JWT secret shared with container, `host.docker.internal` callbacks |
| **Not a PR gate** | heavy; use for overnight / intentional full UI+OO coverage |
| **Artifacts** | on failure: report + test-results (14 days) |

**Not in CI yet:** multi-browser matrix, full `api`/`regression` on every PR, multi-worker on GHA.

**GHA green status:** smoke is best-effort on PR; nightly UI+OO needs a successful `workflow_dispatch` run to confirm GHA OO networking.

## Auth для E2E

Auth — через **storageState** (`setup/auth.setup.ts` → `e2e/.auth/admin.json`).  
Project `auth` гоняет login без preloaded session. Hardcoded JWT удалён (E4).
