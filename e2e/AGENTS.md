# e2e/AGENTS.md — канон E2E HRMS

**Ветка rewrite:** `feat/e2e-rewrite`  
**План:** [`.opencode/plans/2026-07-15-e2e-rewrite.md`](../.opencode/plans/2026-07-15-e2e-rewrite.md)

---

## 1. Назначение

Этот каталог — **единственный** source of truth для Playwright E2E.

- **Новые** тесты пишутся в `api/`, `smoke/`, `ui/`, `auth/`, `setup/` по слоям ниже.
- **Старые** specs живут в `_legacy/**` до cutover (не расширять, только чинить импорты/flake при блокере).
- Source of truth — **TypeScript** (`.ts`). Скомпилированные `.js` twins **запрещены**.

---

## 2. Слои (projects / tags)

| Слой | Project | Где / match | Разрешено | Запрещено |
|------|---------|-------------|-----------|-----------|
| **setup** | `setup` | `setup/*.setup.ts` | login → `storageState` в `.auth/` | бизнес-assert'ы, UI journeys |
| **api** | `api` + tag `@api` | `api/**/*.spec.ts` | HTTP через `request`, seed/cleanup, контракты API | клики, POM, browser-only assert |
| **smoke** | `smoke` + tag `@smoke` | `**/*.spec.ts` с `@smoke` | критичный happy-path UI/API, быстрый gate | глубокие edge-cases, тяжёлые матрицы |
| **ui** | `ui` + tag `@ui` | `**/*.spec.ts` с `@ui` | пользовательские сценарии, POM, формы | «сырой» HTTP без UI-смысла; balance math |
| **auth** | `auth` | `auth/**/*.spec.ts` | login / invite / logout **без** готового storageState | зависимость от admin storage из setup |
| **legacy** | `legacy` | `_legacy/**/*.spec.ts` | временный regression; JWT header (DEPRECATED) | новые сценарии; копипаст в new tree |

**Правило импортов (new tree):** specs → fixtures/helpers/pages; pages не импортируют specs; fixtures не импортируют specs.

---

## 3. Cleanup policy

1. **Каждый create → track → teardown delete.** Нет «создали и забыли».
2. Имена сущностей — prefix **`e2e-`** (и worker-prefix, если multi-worker когда-нибудь включат).
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

**Запрещено в новых specs:**

- `page.waitForTimeout(...)` (фиксированные sleep)
- `waitForLoadState('networkidle')` как основной sync (flake)
- `.nth(n)` без явной причины и комментария
- длинные brittle CSS-цепочки к layout

---

## 5. Auth

| Режим | Статус | Описание |
|-------|--------|----------|
| **storageState** (setup project → `.auth/*.json`) | **target (E1+)** | Реальный login, shared state для smoke/ui/api |
| Hardcoded JWT в `playwright.config` `extraHTTPHeaders` | **DEPRECATED** | Только для project `legacy` до cutover; не копировать в new tests |

Project `auth` гоняет login/invite **без** preloaded storage.

---

## 6. Команды npm

```bash
# Всё (все projects; пустые new — 0 tests)
npm run test:e2e

# Legacy regression (текущие перенесённые specs)
npm run test:e2e:legacy
npm run test:e2e:regression   # alias → legacy на время rewrite

# New layers (пока могут быть 0 tests)
npm run test:e2e:smoke        # setup + smoke
npm run test:e2e:api          # setup + api
npm run test:e2e:ui           # setup + ui
npm run test:e2e:auth

# Список без запуска
npx playwright test --list
npx playwright test --project=legacy --list
```

Окружение: `npm run docker:test:up` (или DEV `npm run dev`).  
Base URL: `E2E_BASE_URL` (default `http://localhost:5173`).

Бывший smoke из 3 файлов → теперь в `_legacy/`; гонять через `test:e2e:legacy` или path:

```bash
npx playwright test --project=legacy e2e/_legacy/ui/structure-full-lifecycle.spec.ts e2e/_legacy/ui/employees.spec.ts e2e/_legacy/domain/vacation-periods-generation.spec.ts
```

---

## 7. Workers / parallel

- **Default:** `workers: 1` (`PW_WORKERS` не задан).
- `fullyParallel: false` на ветке rewrite — стабильность важнее скорости.
- Multi-worker (`PW_WORKERS=N`) — **после** green rewrite (не MVP). При `workers>1` нужен managed browser; shared CDP несовместим.

---

## 8. Структура каталогов

```text
e2e/
  AGENTS.md           # этот канон
  setup/              # *.setup.ts → storageState
  auth/               # login/invite specs
  api/                # @api specs (new)
  smoke/              # optional colocated smoke specs
  ui/                 # @ui specs (new)
  fixtures/           # shared fixtures (legacy + new)
  pages/              # POM
  helpers/
  types/
  _legacy/            # old ui|api|domain specs (temporary)
    ui/
    api/
    domain/
```

---

## 9. Ссылки

- План rewrite: `.opencode/plans/2026-07-15-e2e-rewrite.md`
- Phase E0: `.opencode/plans/E0-e2e-scaffold.md`
- Docs: `docs/testing-guide.md`
- Root monorepo rules: `AGENTS.md` / `Agents.md`
