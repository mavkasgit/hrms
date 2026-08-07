# agents.md — Инструкции для ИИ-агентов

## Workspace harness

Этот репозиторий — часть multi-project workspace **VibeCoding**.
Общая карта, порты и cross-project правила: [`../_harness/AGENTS.md`](../_harness/AGENTS.md)
и [`../_harness/memory/structure.md`](../_harness/memory/structure.md).
Локальные правила **этого** файла главнее harness при конфликте.

---

Этот файл содержит правила и контекст для ИИ-агентов, работающих с проектом HRMS.

---

## Обзор проекта

**HRMS** — корпоративная система управления кадрами.  
Монорепозиторий с разделением на backend, frontend, инфраструктуру и e2e-тесты.

---

## Стек технологий

| Слой         | Технологии                                                     |
| ------------ | -------------------------------------------------------------- |
| **Backend**  | Python 3.11+, FastAPI, SQLAlchemy (async), Alembic, Uvicorn    |
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS                        |
| **Database** | PostgreSQL 15                                                  |
| **Docs**     | OnlyOffice Document Server                                     |
| **Infra**    | Docker Compose (dev / test / prod), Nginx                      |
| **E2E**      | Playwright (Chromium)                                          |
| **Scripts**  | Node.js (`scripts/run.js`), Bash / PowerShell                  |

---

## Архитектура

### Backend (`backend/app/`)

Архитектура: **Layered (слоёная)** с паттерном **Repository**.

```text
api/           → FastAPI-роутеры (HTTP-слой)
schemas/       → Pydantic-схемы (валидация/сериализация)
services/      → Бизнес-логика
repositories/  → Доступ к данным (SQLAlchemy)
models/        → ORM-модели
core/          → Конфигурация, безопасность, зависимости
utils/         → Утилиты
```

**Правила:**
- Роутеры вызывают сервисы, сервисы вызывают репозитории. Никогда не наоборот.
- Используй async/await для всех операций с БД.
- Все изменения схемы БД — через Alembic-миграции (`npm run db:makemigrate`).

### Frontend (`frontend/src/`)

Архитектура: **Feature-Sliced Design (FSD)**.

```text
app/           → Корень приложения, роутинг, провайдеры
entities/      → Доменные сущности (модели, API-клиенты)
features/      → Фичи (пользовательские сценарии)
pages/         → Страницы (композиция фич)
shared/        → Общие компоненты, UI-кит, утилиты, хуки
modules/       → Переносимые модули (см. ниже)
```

**Правила:**
- Слои могут импортировать только из нижестоящих слоёв (shared → entities → features → pages).
- Стилизация через TailwindCSS.
- TypeScript strict mode.

#### Переносимые модули (`frontend/src/modules/`)

Самодостаточные модули, копируемые между приложениями семейства (HRMS, KTM, …)
без правок внутреннего кода. Вне FSD-иерархии намеренно.

- `modules/user-settings/` — модальное окно настроек пользователя
  (профиль/внешний вид/безопасность/сессии). Публичный API — только `index.ts`;
  хост-импорты (shadcn) — только через `ui.ts`; данные — через интерфейс
  `UserSettingsApi` (`createHttpAdapter` или своя реализация). Контракт и
  инструкция по переносу — в `modules/user-settings/README.md`.
- `modules/notifications/` — переносимый колокольчик уведомлений (бейдж + попап).
  Публичный API — только `index.ts`; хост-импорты — только через `ui.ts`;
  данные — через интерфейс `NotificationsApi`. При обновлении бампай
  `NOTIFICATIONS_MODULE_VERSION`; сверка копий модулей с KTM — `npm run verify:sync`
  (манифест `scripts/sync-manifest.json`, файлы модулей — в режимах content/version/presence).
- HRMS-обвязка user-settings живёт в `features/user-settings/`, обвязка
  notifications — в `features/notifications/` (адаптеры поверх проектного axios).
- При обновлении модуля бампай `USER_SETTINGS_MODULE_VERSION`.

---

## Интеграция с CodeGraph

Проект индексируется с помощью [CodeGraph](https://github.com/colbymchenry/codegraph).

### Использование

При работе с проектом используй MCP-инструменты CodeGraph для навигации по кодовой базе:

| Инструмент            | Назначение                                                    |
| --------------------- | ------------------------------------------------------------- |
| `codegraph_search`    | Поиск функций, классов, модулей по имени                      |
| `codegraph_callers`   | Кто вызывает данную функцию/метод                             |
| `codegraph_callees`   | Что вызывает данная функция/метод                             |
| `codegraph_impact`    | Анализ влияния изменений (что сломается)                      |
| `codegraph_node`      | Детальная информация об узле графа                            |
| `codegraph_explore`   | Исследование структуры модуля                                 |
| `codegraph_files`     | Список файлов в индексе                                       |
| `codegraph_status`    | Статус индекса                                                |

### Переиндексация

При значительных изменениях структуры проекта выполни:
```bash
npx @colbymchenry/codegraph init -i
```

---

## Команды разработки

### Быстрый старт

```bash
npm run setup     # Установка зависимостей
npm run dev       # Запуск DEV (DB + backend + frontend)
```

### Тестирование (Playwright e2e)

```bash
npm run test:e2e:smoke       # Smoke-тесты (быстрая проверка)
npm run test:e2e:ui          # UI-тесты
npm run test:e2e:api         # API-тесты
npm run test:e2e:auth        # Auth (login, без storage)
npm run test:e2e:regression  # Полная регрессия (smoke+ui+api+auth)
```

**Перед запуском e2e-тестов** убедись, что:
1. TEST-окружение поднято (`npm run docker:test:up`).
2. Или DEV-окружение работает (`npm run dev`).

**CI:** workflow [`.github/workflows/e2e-smoke.yml`](.github/workflows/e2e-smoke.yml) — setup+smoke на GHA  
(postgres + uvicorn + Vite). PR path best-effort; manual via `workflow_dispatch`.  
См. `docs/testing-guide.md` (секция «E2E smoke»).

### Миграции БД

```bash
npm run dev:migrate                   # Применить миграции
npm run db:makemigrate -- -m "msg"    # Создать новую миграцию
```

---

## Правила разработки

### Общие

1. **Язык**: Комментарии в коде — на русском или английском (следуй стилю файла). Документация — русский.
2. **Git**: Коммиты на русском. Формат: `тип: описание` (например, `feat: добавлен расчёт баланса отпуска`).
3. **Тесты**: Любое изменение бизнес-логики должно сопровождаться e2e-тестом.

### Backend

1. Всегда используй **async** эндпоинты и репозитории.
2. Валидация входных данных — через **Pydantic-схемы** (не в роутере).
3. Обработка ошибок — через `HTTPException` с корректными статус-кодами.
4. Новые зависимости добавляй в `backend/requirements.txt`.

### Frontend

1. Компоненты — функциональные, с хуками.
2. Следуй **FSD-архитектуре**: не импортируй из вышестоящих слоёв.
3. Типизация: никаких `any` без обоснования.
4. Новые зависимости: `npm install --prefix frontend <pkg>`.

### E2E-тесты

1. Используй **Page Object Model** (директория `e2e/pages/`).
2. Тестовые данные — через фикстуры (`e2e/fixtures/`).
3. Хелперы — в `e2e/helpers/`.
4. Типы — в `e2e/types/`.

---

## Структура env-файлов

| Файл          | Назначение            |
| ------------- | --------------------- |
| `.env.dev`    | Локальная разработка  |
| `.env.test`   | Тестовое окружение    |
| `.env.prod`   | Продакшн              |
| `.env.example`| Шаблон со всеми ключами |

---

## Полезные ссылки

- Backend API Docs: http://localhost:8000/docs (Swagger UI)
- Frontend Dev: http://localhost:5171
- Playwright Report: `playwright-report/`

---

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (`mavkasgit/hrms`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
