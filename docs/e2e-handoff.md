# E2E Handoff — HRMS Playwright

**Дата:** 2026-07-16  
**Статус:** rewrite **влит в `main`** (PR [#4](https://github.com/mavkasgit/hrms/pull/4), merge `be775de`)  
**Канон (как писать тесты):** [`e2e/AGENTS.md`](../e2e/AGENTS.md)  
**Общий testing guide:** [`docs/testing-guide.md`](./testing-guide.md)

Этот файл — **handoff для человека/агента**: что уже сделано, что осталось, как запускать и продолжать.  
Не дублирует весь канон — детали слоёв/selectors/cleanup → `e2e/AGENTS.md`.

---

## 1. Что сделано (итог эпика)

### 1.1 Инфраструктура

| Компонент | Состояние |
|-----------|-----------|
| Структура suite | `setup` / `auth` / `api` / `smoke` / `ui` (Playwright projects) |
| Auth | UI login → `e2e/.auth/admin.json` (storageState); project `auth` без storage |
| Fixtures | `e2e/fixtures/api.ts` — `apiOps` (create + track + DELETE teardown, prefix `e2e-` / `w{N}-`) |
| Hardcoded JWT | **убран** из global config |
| Legacy suite | **удалён** (cutover E4); dual path нет |
| Multi-worker | opt-in: `PW_WORKERS=2` + `E2E_BROWSER_MODE=managed`; default **workers: 1** |
| CI | `.github/workflows/e2e-smoke.yml` — setup+smoke; pytest отдельно `test-backend.yml` |
| Docs | `e2e/AGENTS.md`, `docs/testing-guide.md` |

### 1.2 Покрытие (порядок величины)

~**32** `.spec.ts` (+ setup).  
На merge PR #4 было ~22 specs; **+4 P0** (import, hire/dismissal OO, edit-docx, group-drafts); **+6 P1** (users, holidays, vacation tabs, notifications/statements, templates, other order types) — 2026-07-16.

| Project | Содержание (кратко) |
|---------|---------------------|
| **setup** | admin login → storageState |
| **auth** | valid login + bad password |
| **api** | catalog, errors, timesheet, vacation balance/periods smoke, order-type letter |
| **smoke** | nav, structure, employees CRUD, orders list shell, timesheet open, vacations happy |
| **ui** | structure/employees lifecycle, vacations/plan/add-days, absences, timesheet deeper, **orders OO** (create, hire/dismissal, edit-docx, group-drafts, other types), **import**, **settings** (users, holidays), **vacation adjustment tabs**, **notifications/statements**, **templates** smoke |

### 1.3 OnlyOffice order (важный сценарий)

**Есть:** `e2e/ui/order-onlyoffice-create.spec.ts` (+ hire/dismissal, other types, edit-docx, group-drafts)

```text
API: seed employee
→ UI /orders: выбрать сотрудника + тип (transfer) + номер
→ «Создать приказ» → popup draft /edit-docx
→ OnlyOffice + «Сохранить приказ» (forcesave + commit)
→ проверка в реестре / API
→ cleanup
```

**Нужно для прогона:** FE `:5173`, BE `:8000`, OnlyOffice DS (dev: `:8085`).

### 1.4 CI notes

- **pytest** — green на PR #4  
- **Playwright smoke** — green после фиксов: `PYTHONPATH` для seed admin; dismiss/restore через фильтр статуса  
- **GitGuardian** — внешний app, не workflow репо; может краснеть (placeholder secrets); **не обязателен** для merge, можно отключить в GitHub Apps  

---

## 2. Что осталось (долги / backlog)

Приоритеты из разведки после merge (не блокеры main, а «защититься дальше»).

### P0 — высокий смысл для контроля процесса — **сделано 2026-07-16**

| # | Долг | Файл / статус |
|---|------|----------------|
| 1 | **Приказ hire / dismissal** через UI + OO | ✅ `e2e/ui/order-hire-dismissal-oo.spec.ts` |
| 2 | **Редактирование существующего** приказа `/orders/:id/edit-docx` | ✅ `e2e/ui/order-edit-docx.spec.ts` |
| 3 | **Group unpaid / weekend** (group-drafts) | ✅ `e2e/ui/group-drafts-oo.spec.ts` |
| 4 | **Import employees** UI (excel preview/confirm) | ✅ `e2e/ui/import-employees.spec.ts` |

### P1 — важные экраны — **сделано 2026-07-16**

| # | Долг | Файл / статус |
|---|------|----------------|
| 5 | Settings: **users** (invite/роли) | ✅ `e2e/ui/settings-users.spec.ts` |
| 6 | Settings: **holidays** | ✅ `e2e/ui/settings-holidays.spec.ts` |
| 7 | Vacation **recall / postpone / extension** tabs | ✅ `e2e/ui/vacation-adjustment-tabs.spec.ts` (shallow tabs) |
| 8 | **Notifications / statements** (+ OO при необходимости) | ✅ `e2e/ui/notifications-statements.spec.ts` |
| 9 | **Templates** UI (shallow smoke) | ✅ `e2e/ui/templates-smoke.spec.ts` |
| 10 | Другие **типы приказов** кроме transfer в OO-сценарии | ✅ `e2e/ui/order-other-types-oo.spec.ts` |

### P2 — низкий приоритет / уже pytest

| # | Долг | Комментарий |
|---|------|-------------|
| 11 | Backups restore | destructive; backend tests |
| 12 | Live Telegram QR | external; pytest mocks |
| 13 | Dashboard deep | shallow optional |
| 14 | Multi-worker full **ui** suite | smoke@2 ok; ui default serial |
| 15 | CI full **ui** + OnlyOffice job | тяжело; nightly optional |

### Техдолг оболочки

- Мёртвые методы POM (`openImportModal`, часть VacationsPage) — либо тест, либо удалить  
- Structure/timesheet/absences — много inline selectors  
- `apiOps` без helpers: tags, import, group-drafts, users  

---

## 3. Как запускать

### 3.1 Предусловия

```powershell
cd C:\Users\user\VibeCoding\hrms
# Postgres dev, backend :8000, frontend :5173
npm run dev          # или dev:backend + frontend отдельно
```

Admin (dev): `E2E_ADMIN_USERNAME=admin`, `E2E_ADMIN_PASSWORD=dev`  
(см. `e2e/.env.example`, `DEV_BYPASS_AUTH`).

OnlyOffice (для order OO-теста): `ONLYOFFICE_*`, DS обычно `http://localhost:8085`.

### 3.2 Команды

```powershell
# Быстрый gate (как CI)
npm run test:e2e:smoke

# API-only
npm run test:e2e:api

# Клики / контроль процесса
npm run test:e2e:ui

# Login без storage
npm run test:e2e:auth

# Всё new suite (regression)
npm run test:e2e:regression
# или:
npx playwright test --project=setup --project=auth --project=smoke --project=api --project=ui

# Только OnlyOffice order
npx playwright test --project=setup --project=ui e2e/ui/order-onlyoffice-create.spec.ts

# Multi-worker (opt-in, managed browser)
npx cross-env PW_WORKERS=2 E2E_BROWSER_MODE=managed npm run test:e2e:smoke
```

### 3.3 Слои — что гонять «для контроля»

| Цель | Команда |
|------|---------|
| «Система жива» | `test:e2e:smoke` |
| «Процессы кликами» | `test:e2e:ui` |
| «API контракты» | `test:e2e:api` |
| «Приказ + документ» | OO-spec выше + живой OnlyOffice |

---

## 4. Как добавлять новый тест (чеклист)

1. Прочитать **`e2e/AGENTS.md`** (слой, cleanup, selectors).  
2. Выбрать слой: `@smoke` / `@ui` / `@api` / `auth`.  
3. Seed данных через **`apiOps`** (или UI create с последующим track).  
4. Имена: `e2e-…` + `apiOps.uid()` (worker-aware).  
5. **Не** hardcoded JWT; storageState от setup (кроме `auth`).  
6. Cleanup: create через apiOps **или** явный delete tracked ids.  
7. Selectors: role/label → testid `e2e-*` → CSS last resort.  
8. Локально: `npx playwright test --project=setup --project=<layer> path/to.spec.ts`.  
9. Не раздувать e2e **математикой отпусков** — это backend pytest.  

### Паттерн данных

```text
setup (раз на suite): login → .auth/admin.json
каждый тест:
  apiOps.create*  ИЛИ  UI create
  assert (UI и/или API)
  fixture teardown DELETE tracked
```

**Сейв** = только сессия admin. Бизнес-сущности тест **создаёт сам**, не «берёт из дампа».

---

## 5. Карта ключевых файлов

```text
e2e/
  AGENTS.md                 # канон
  setup/auth.setup.ts       # storageState
  auth/login.spec.ts
  fixtures/api.ts           # apiOps
  fixtures/auth.ts
  fixtures/index.ts
  helpers/onlyoffice-editor.ts  # shared OO editor helpers
  pages/                    # POM (Employees, Orders, Vacations, Layout, Users, …)
  smoke/*.spec.ts
  ui/*.spec.ts              # orders OO, import, settings-users/holidays,
                            # vacation-adjustment-tabs, notifications-statements,
                            # templates-smoke, order-other-types-oo, …
  api/*.spec.ts
playwright.config.ts
.github/workflows/e2e-smoke.yml
docs/e2e-handoff.md         # этот файл
docs/testing-guide.md
```

---

## 6. Worktree (если ещё используется)

Во время разработки e2e жил в:

```text
C:\Users\user\VibeCoding\hrms      → main (после merge)
C:\Users\user\VibeCoding\hrms-e2e  → worktree feat/e2e-rewrite (можно удалить)
```

Убрать worktree (когда не нужен):

```powershell
cd C:\Users\user\VibeCoding\hrms
git worktree remove C:\Users\user\VibeCoding\hrms-e2e
# ветку feat/e2e-rewrite можно удалить remote/local после merge
```

Дальше работа — **из `hrms` на `main`** (или feature-ветки от main).

---

## 7. История (кратко)

| Фаза | Суть |
|------|------|
| E0 | scaffold, projects, AGENTS |
| E1 | auth storageState + api fixtures |
| E2 | P0 smoke/api |
| E3 | rewrite legacy UI/API в новую оболочку (domain slim) |
| E4 | delete legacy |
| E5 | CI e2e-smoke |
| E6 | multi-worker opt-in |
| + | UI OnlyOffice order create |
| CI fix | PYTHONPATH seed; dismiss smoke filter |
| **PR #4** | merged → main |
| **P0** | hire/dismissal, edit-docx, group-drafts, import (2026-07-16) |
| **P1** | users, holidays, vacation tabs, notif/statements, templates, other OO types (2026-07-16) |

Планы/отчёты агентов (если есть локально): `.opencode/plans/2026-07-15-e2e-rewrite.md`, scratchpad `scout-e2e-*` — не обязательны для runtime.

---

## 8. Следующий шаг (для агента / человека)

1. **P0 + P1 закрыты** (2026-07-16).  
2. Дальше — **опционально P2 / техдолг**: backups, live TG QR, dashboard deep, multi-worker ui, CI full ui+OO; POM dead methods; inline selectors; apiOps helpers.  
3. Локально: `npm run test:e2e:smoke` (+ `test:e2e:ui` при OO-сценариях).  
4. Не смешивать с backend pytest/xdist — они уже отдельно на main.

---

*Handoff: e2e rewrite + P0/P1 coverage on main; next = P2 / tech debt optional.*
