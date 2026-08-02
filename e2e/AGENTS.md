# e2e/AGENTS.md — канон E2E HRMS

**Ветка:** `main` (rewrite влит PR #4, 2026-07-15)  
**Покрытие / backlog / как гонять:** [`docs/testing-guide.md`](../docs/testing-guide.md)

---

## 1. Назначение

Этот каталог — **единственный** source of truth для Playwright E2E.

- Тесты пишутся в `api/`, `smoke/`, `ui/`, `auth/`, `setup/` по слоям ниже.
- Source of truth — **TypeScript** (`.ts`). Скомпилированные `.js` twins **запрещены**.
- Legacy suite (`_legacy/**`) **удалён** (E4 cutover).

---

## 2. Слои (projects / tags)

| Слой | Project | Где / match | Разрешено | Запрещено |
|------|---------|-------------|-----------|-----------|
| **setup** | `setup` | `setup/*.setup.ts` | login → `storageState` в `.auth/` | бизнес-assert'ы, UI journeys |
| **api** | `api` + tag `@api` | `api/**/*.spec.ts` | HTTP через `request`, seed/cleanup, контракты API | клики, POM, browser-only assert |
| **smoke** | `smoke` + tag `@smoke` | `**/*.spec.ts` с `@smoke` | критичный happy-path UI/API, быстрый gate | глубокие edge-cases, тяжёлые матрицы |
| **ui** | `ui` + tag `@ui` | `**/*.spec.ts` с `@ui` | пользовательские сценарии, POM, формы, **клики для контроля процесса** | «сырой» HTTP без UI-смысла; balance math |
| **auth** | `auth` | `auth/**/*.spec.ts` | login / invite / logout **без** готового storageState | зависимость от admin storage из setup |

### Когда какой слой (контроль процесса)

| Нужно | Слой | Почему |
|-------|------|--------|
| Быстрый gate «стенд жив / login / core pages» | **`@smoke`** | короткий happy-path, CI e2e-smoke |
| Проверить **клики, формы, POM, UX-поток** (контроль процесса глазами пользователя) | **`@ui`** | именно клики и UI-состояния; не заменять API-only assert'ами |
| Контракт API, коды ошибок, seed/cleanup без UI | **`@api`** | HTTP `request`, без кликов |
| Login / bad password без storage | **auth** | чистая сессия |

**Правило импортов:** specs → fixtures/helpers/pages; pages не импортируют specs; fixtures не импортируют specs.

---

## 3. Cleanup policy

1. **Каждый create → track → teardown delete.** Нет «создали и забыли».
2. Имена сущностей — prefix **`e2e-`** + worker tag **`w{N}-`** через `apiOps.uid()` (`parallelIndex`).
3. **Create without track = bug** — фикстура/хелпер обязан зарегистрировать id для cleanup.
4. **Нет** wipe всей БД между тестами (ни TRUNCATE app DB, ни drop schema).
5. Residual data допустим **только** после crash/timeout runner'а; в зелёном прогоне БД чистая по tracked entities.
6. Cleanup в `afterEach` / fixture teardown; порядок delete учитывает FK (order → employee → position → department и т.п.).

---

## 4. Selectors

**Приоритет:**

1. `getByRole` / `getByLabel` / `getByText` (устойчивый accessible name)
2. `getByTestId('e2e-…')` — только если role/label нестабильны; testid добавлять точечно во frontend
3. CSS / class — **крайний** случай, с комментарием почему

**Запрещено в specs:**

- `page.waitForTimeout(...)` (фиксированные sleep)
- `waitForLoadState('networkidle')` как основной sync (flake)
- `.nth(n)` без явной причины и комментария
- длинные brittle CSS-цепочки к layout

---

## 5. Auth

| Режим | Статус | Описание |
|-------|--------|----------|
| **storageState** | **active** | `setup/auth.setup.ts` → `e2e/.auth/admin.json`; projects `api` / `smoke` / `ui` зависят от `setup` и грузят storage |
| **auth project** | **active** | `auth/login.spec.ts` — success + bad password; **без** storageState |

Hardcoded JWT / `extraHTTPHeaders` Authorization — **удалены** (E4).

### Credentials (dev)

| Переменная | Default | Назначение |
|------------|---------|------------|
| `E2E_ADMIN_USERNAME` | `admin` | Логин для setup/auth |
| `E2E_ADMIN_PASSWORD` | `dev` | Пароль break-glass; должен совпадать с `BREAK_GLASS_PASSWORD` бэкенда |
| `E2E_BASE_URL` | `http://localhost:5171` | Frontend |
| `E2E_API_URL` | `http://localhost:8000/api` | API base |

Шаблон: `e2e/.env.example`. Локально: `e2e/.env`.

**Путь login:** break-glass форма на `/login` (placeholder «Пароль аварийного доступа» → «Аварийный вход») → `POST /auth/break-glass/login` (проверка по env-конфигу `BREAK_GLASS_*`, не по БД). Парольного входа нет (#36: `POST /auth/login` удалён → 404).  
При OIDC on страница также показывает SSO CTA и может auto-redirect'ить в Authentik; если IdP недоступен — остаётся форма break-glass (см. `setup/auth.setup.ts`).

**API request auth:** Playwright `request` не видит localStorage → `fixtures/api.ts` читает token из storageState (`getAdminTokenFromStorage`) и создаёт context с `Authorization: Bearer …`.  
Для raw HTTP вне apiOps: `helpers/api-request.ts` → `createAuthenticatedRequest(playwright)`.

**Импорт:** `import { test, expect } from '../fixtures/index'` (apiOps + storageState).

**POM login:** `e2e/pages/LoginPage.ts` — break-glass форма + SSO CTA; используется в `setup/auth.setup.ts`, `auth/login.spec.ts`, `auth/oidc-login.spec.ts`.

**P0 smoke/api:**
- smoke: `e2e/smoke/*.spec.ts` (titles contain `@smoke`)
- api: `e2e/api/*.spec.ts` (titles contain `@api`)
- UI dismiss «Уволить» → flow приказа, не soft-dismiss; soft cycle — `apiOps.dismiss/restore`

### Authentik / OIDC (optional)

| Режим | CI / default | Описание |
|-------|--------------|----------|
| **Break-glass** | **active** | `setup` + `auth/login.spec.ts` — форма аварийного входа на `/login`; работает при OIDC off **и** on |
| **OIDC e2e** | **opt-in** | `auth/oidc-login.spec.ts` (`@oidc`) — skip без флагов; **не** требует Authentik в GHA smoke |

**Правила:**

1. CI smoke **не** поднимает Authentik и **не** ставит `E2E_OIDC=1`.
2. `setup/auth.setup.ts` — **только** форма break-glass. OIDC в setup **запрещён**.

**Локальный OIDC:**

1. Поднять IdP: sibling repo `C:\Users\user\VibeCoding\authentik` (compose / docs там).
2. В HRMS backend: `AUTH_OIDC_ENABLED` (и связанные `AUTH_OIDC_*`, client, issuer).
3. Запуск opt-in suite:

```bash
# config + SSO button (нужны E2E_OIDC=1 и backend enabled)
cross-env E2E_OIDC=1 npm run test:e2e:oidc

# + redirect на IdP (localhost:9000 / AUTHENTIK_URL)
cross-env E2E_OIDC=1 E2E_OIDC_FULL=1 npm run test:e2e:oidc

# + полный login через form Authentik (секреты только в env, не в репо)
# E2E_AUTHENTIK_USER / E2E_AUTHENTIK_PASSWORD
cross-env E2E_OIDC=1 E2E_OIDC_FULL=1 npm run test:e2e:oidc
```

| Переменная | Default | Назначение |
|------------|---------|------------|
| `E2E_OIDC` | unset | `1` — включить suite; иначе все `@oidc` → skip |
| `E2E_OIDC_FULL` | unset | `1` — redirect / full IdP login tests |
| `E2E_AUTHENTIK_USER` | unset | логин в Authentik (full login only) |
| `E2E_AUTHENTIK_PASSWORD` | unset | пароль IdP (full login only) |
| `AUTHENTIK_URL` / `E2E_AUTHENTIK_URL` | `http://localhost:9000` (hint) | host для assert redirect |

Guard внутри spec: `E2E_OIDC=1` **и** `GET {E2E_API_URL}/auth/oidc/config` → `enabled===true`; иначе skip (не fail).

---

## 6. Команды npm

```bash
# Всё (все projects)
npm run test:e2e

# Слои — serial (default, workers: 1) — контроль / debug
npm run test:e2e:smoke        # setup + smoke (быстрый gate)
npm run test:e2e:api          # setup + api (контракты HTTP)
npm run test:e2e:ui           # setup + ui (клики / контроль процесса)
npm run test:e2e:auth         # auth only (no storage) — break-glass + oidc file (oidc skips w/o E2E_OIDC)
npm run test:e2e:oidc         # OIDC/Authentik opt-in (sets E2E_OIDC=1; still skips if backend disabled)
npm run test:e2e:regression   # setup + smoke + ui + api + auth

# Parallel opt-in (managed browser; file-level parallel; CI smoke stays workers:1)
npm run test:e2e:smoke:parallel   # PW_WORKERS=2
npm run test:e2e:ui:parallel      # full @ui suite with 2 workers
# Optional test-level parallel (riskier for OO): PW_FULLY_PARALLEL=1

# Список без запуска
npx playwright test --list
npx playwright test --project=setup --list
npx playwright test --project=auth --list
```

Окружение: `npm run docker:test:up` (или DEV `npm run dev` — нужны frontend **и** backend для login).  
Base URL: `E2E_BASE_URL` (default `http://localhost:5171`).

## 7. Workers / parallel

| Режим | Как | `fullyParallel` | Browser |
|-------|-----|-----------------|---------|
| **Serial (default)** | `PW_WORKERS` не задан → `workers: 1` | `false` | managed/headless/headed/cdp |
| **Opt-in parallel** | `PW_WORKERS=2+` + `E2E_BROWSER_MODE=managed` | `false` (file-level) | **только** managed/headless/headed |
| **Test-level parallel** | + `PW_FULLY_PARALLEL=1` | `true` | managed; riskier for OO |
| **CI e2e-smoke** | без `PW_WORKERS` → **workers: 1** | `false` | managed (GHA) |
| **CI e2e-ui-nightly** | workers: 1 + OnlyOffice DS | `false` | managed (GHA nightly) |

- Multi-worker **opt-in**: data isolation через `apiOps.uid()` → `w{N}-…` (`workerPrefix(parallelIndex)`).
- Shared admin `storageState` OK (read-heavy + unique `e2e-` names). Отдельные admin-аккаунты **не** нужны.
- **CDP + multi-worker = fail-fast** в `playwright.config.ts` (`E2E_BROWSER_MODE=cdp` и `PW_WORKERS>1` → throw).
- **CI smoke/PR:** `workers: 1`. Multi-worker — локально (`npm run test:e2e:ui:parallel`).
- **CI knobs:** `retries: 2`, HTML reporter, `reuseExistingServer: false` (см. `playwright.config.ts`).

### CI e2e-smoke

Workflow: [`.github/workflows/e2e-smoke.yml`](../.github/workflows/e2e-smoke.yml)  
Команда: `npx playwright test --project=setup --project=smoke` (**workers: 1**, без `PW_WORKERS`)  
Стек: postgres service + migrate + seed admin + uvicorn + Vite (webServer).  
PR path — **best-effort** (`continue-on-error`); для intentional run — `workflow_dispatch`.  

### CI e2e-ui-nightly (OnlyOffice)

Workflow: [`.github/workflows/e2e-ui-nightly.yml`](../.github/workflows/e2e-ui-nightly.yml)  
Triggers: `schedule` (03:15 UTC) + `workflow_dispatch`.  
Команда: `setup + smoke + ui` (**workers: 1**), Document Server docker `:8085`.  
Подробности: `docs/testing-guide.md`.

---

## 8. Структура каталогов

```text
e2e/
  AGENTS.md           # этот канон
  .env.example        # E2E_* template
  .auth/              # gitignored storageState (admin.json)
  setup/              # auth.setup.ts → storageState
  auth/               # login.spec.ts + oidc-login.spec.ts (no storage)
  api/                # @api specs
  smoke/              # @smoke specs
  ui/                 # @ui specs
  fixtures/
    index.ts          # suite entry: test + apiOps
    api.ts            # tracked create/delete, e2e- prefix
    auth.ts           # storage paths + credentials
  pages/              # POM (used by smoke/ui)
  helpers/
  types/
```

---

## 9. Migration map (legacy → new) — E4 deleted

| Legacy (deleted) | New path | Status |
|------------------|----------|--------|
| `_legacy/ui/structure-full-lifecycle.spec.ts` | `ui/structure-lifecycle.spec.ts` + `smoke/structure.spec.ts` | **done** |
| `_legacy/ui/employees.spec.ts` | `ui/employees-lifecycle.spec.ts` + `smoke/employees-crud.spec.ts` | **done** |
| `_legacy/ui/vacations.spec.ts` | `ui/vacations-basic.spec.ts` + `smoke/vacations-happy.spec.ts` | **done** |
| `_legacy/ui/vacation-plan-fill.spec.ts` | `ui/vacation-plan-fill.spec.ts` | **done** |
| `_legacy/ui/add-vacation-days.spec.ts` | `ui/add-vacation-days.spec.ts` | **done** |
| `_legacy/ui/unpaid-leaves-and-weekend-calls.spec.ts` | `ui/absences.spec.ts` | **done** |
| `_legacy/ui/timesheet.spec.ts` | `ui/timesheet.spec.ts` + `smoke/timesheet-open.spec.ts` | **done** |
| `_legacy/ui/order-type-letter.spec.ts` | `api/order-type-letter.spec.ts` | **done** |
| (new) order + OnlyOffice | `ui/order-onlyoffice-create.spec.ts` | **done** — employee → draft OO → save → list |
| `_legacy/api/api-errors.spec.ts` | `api/errors.spec.ts`, `api/employees-errors.spec.ts` | **done** |
| `_legacy/api/catalog-lifecycle.spec.ts` | `api/catalog.spec.ts` | **done** |
| `_legacy/api/timesheet-api.spec.ts` | `api/timesheet.spec.ts` | **done** |
| `_legacy/domain/vacation-periods-generation.spec.ts` | `api/vacation-periods-smoke.spec.ts` | **done** |
| `_legacy/domain/vacation-balance.spec.ts` | `api/vacation-balance-smoke.spec.ts` | **done** |

## 10. Ссылки

- План rewrite: `.opencode/plans/2026-07-15-e2e-rewrite.md`
- Phase E4: `.opencode/plans/E4-e2e-cutover.md`
- Docs: `docs/testing-guide.md`
- Root monorepo rules: `AGENTS.md` / `Agents.md`
