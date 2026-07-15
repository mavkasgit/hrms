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

# parallel opt-in (local only)
cross-env PW_WORKERS=2 E2E_BROWSER_MODE=managed npm run test:e2e:smoke
cross-env PW_WORKERS=2 E2E_BROWSER_MODE=managed npm run test:e2e:ui
```

Изоляция данных: `apiOps.uid()` → prefix `w{N}-` (`workerPrefix(parallelIndex)`), сущности `e2e-…`.

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
# truncate mode
cross-env HRMS_TEST_ISOLATION=truncate python -m pytest tests/test_db_isolation.py -q
# Windows PowerShell:
# $env:HRMS_TEST_ISOLATION='truncate'; python -m pytest tests/test_db_isolation.py -q
```

### CI (GitHub Actions)

#### Backend pytest

Workflow [`.github/workflows/test-backend.yml`](../.github/workflows/test-backend.yml):
- service `postgres:15` на `:5432`;
- `HRMS_TEST_DATABASE_URL=postgresql+asyncpg://hrms_user:hrms_pass@localhost:5432/hrms_test`;
- `python -m pytest -n auto --dist=loadfile -q` в `backend/`.

#### E2E smoke (Playwright)

Workflow [`.github/workflows/e2e-smoke.yml`](../.github/workflows/e2e-smoke.yml):

| | |
|--|--|
| **Triggers** | `workflow_dispatch`, `pull_request`, `push` → `main` / `master` / `feat/e2e-rewrite` |
| **Command** | `npx playwright test --project=setup --project=smoke` (`workers: 1`) |
| **Stack** | GHA `postgres:15` → alembic migrate → seed `admin` → uvicorn `:8000` → Playwright `webServer` (Vite `:5173`) |
| **Credentials** | `E2E_ADMIN_USERNAME=admin` / `E2E_ADMIN_PASSWORD=dev` + `DEV_BYPASS_AUTH=true` |
| **PR policy** | **best-effort** (`continue-on-error: true` on `pull_request`) — flaky full stack must not block merge until green is proven on GHA |
| **Manual** | Actions → **e2e-smoke** → **Run workflow** (hard-fail for debugging) |
| **Artifacts** | on failure: `playwright-report/` + `test-results/` (7 days) |

**CI knobs** (`playwright.config.ts`): `forbidOnly`, `retries: 2` (CI), `workers: 1`, `reuseExistingServer: !CI`, HTML reporter in CI.

**Not in CI yet:** multi-browser matrix, full `ui`/`api`/`regression`, OnlyOffice.

**GHA green status:** workflow logic is sound for this monorepo; **end-to-end green on GitHub Actions is not verified** from this change alone (workflow_dispatch-first until a successful Actions run).

## Auth для E2E

Auth — через **storageState** (`setup/auth.setup.ts` → `e2e/.auth/admin.json`).  
Project `auth` гоняет login без preloaded session. Hardcoded JWT удалён (E4).
