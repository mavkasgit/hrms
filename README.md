# HRMS

Корпоративная HRMS-система для управления кадрами, организационной структурой, отпусками, приказами и документооборотом.  
Построена на **FastAPI + React + PostgreSQL + OnlyOffice** с кроссплатформенным запуском (Linux / macOS / Windows).

---

## Стек

| Слой         | Технологии                                                       |
| ------------ | ---------------------------------------------------------------- |
| **Backend**  | Python 3.11+, FastAPI, SQLAlchemy (async), Alembic, Uvicorn      |
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS                          |
| **Database** | PostgreSQL 15                                                    |
| **Docs**     | OnlyOffice Document Server (генерация приказов, шаблонов)        |
| **Infra**    | Docker Compose (dev / test / prod), Nginx                        |
| **E2E**      | Playwright (Chromium) — UI, API, Domain-тесты                    |
| **Scripts**  | Node.js (`scripts/run.js`), Bash / PowerShell (кроссплатформа)   |

---

## Структура проекта

```text
hrms/
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI-роутеры
│   │   ├── core/           # Конфигурация, безопасность
│   │   ├── models/         # SQLAlchemy-модели
│   │   ├── repositories/   # Доступ к данным (Repository pattern)
│   │   ├── schemas/        # Pydantic-схемы
│   │   ├── services/       # Бизнес-логика
│   │   ├── utils/          # Утилиты
│   │   └── main.py         # Точка входа FastAPI
│   ├── alembic/            # Миграции БД
│   ├── fonts/              # Шрифты для документов
│   ├── tests/              # Unit-тесты (pytest)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/            # Корень приложения, роутинг
│   │   ├── entities/       # Доменные сущности
│   │   ├── features/       # Фичи (Feature-Sliced Design)
│   │   ├── pages/          # Страницы
│   │   └── shared/         # Общие компоненты, утилиты, UI
│   ├── public/
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── Dockerfile
├── e2e/
│   ├── api/                # API-тесты
│   ├── ui/                 # UI-тесты
│   ├── domain/             # Доменные/интеграционные тесты
│   ├── fixtures/           # Тестовые фикстуры
│   ├── helpers/            # Хелперы для тестов
│   ├── pages/              # Page Object Model
│   └── types/              # TypeScript-типы для тестов
├── infra/
│   ├── compose/
│   │   ├── docker-compose.dev.yml
│   │   ├── docker-compose.test.yml
│   │   └── docker-compose.prod.yml
│   ├── nginx/
│   └── lan/
├── scripts/
│   ├── run.js              # Кроссплатформенный лончер
│   ├── run-backend.sh|ps1  # Запуск backend
│   ├── run-migrate.sh|ps1  # Миграции с ожиданием БД
│   └── wait-for-postgres.sh|ps1
├── data/                   # Docker volumes (gitignored)
├── docs/                   # Документация
├── logs/                   # Логи приложения
├── .env.dev / .env.test / .env.prod
├── package.json
├── playwright.config.ts
└── Makefile
```

---

## Быстрый старт

### Подготовка

```bash
# 1. Установка Node.js-зависимостей (корень + frontend)
npm install
npm install --prefix frontend

# 2. Установка Python-зависимостей
pip install -r backend/requirements.txt
```

> Или одной командой: `npm run setup`

### DEV-режим

Docker поднимает только PostgreSQL + OnlyOffice, backend и frontend работают локально.

```bash
# Поднять всё одной командой (DB → миграции → backend + frontend)
npm run dev
```

| Сервис    | URL                       |
| --------- | ------------------------- |
| Frontend  | http://localhost:5173      |
| Backend   | http://localhost:8000      |
| API Docs  | http://localhost:8000/docs |

### TEST-режим

Полностью контейнеризированное окружение.

```bash
# Поднять test-окружение
npm run docker:test:up

# С Cloudflare-туннелем
npm run test:tunnel:up
```

| Сервис    | URL                  |
| --------- | -------------------- |
| Entry     | http://localhost:8080 |

### PROD-режим

```bash
# Поднять prod-окружение
npm run docker:prod:up

# С Cloudflare-туннелем
npm run prod:tunnel:up
```

| Сервис    | URL                |
| --------- | ------------------ |
| Entry     | http://localhost    |

---

## Основные команды (npm scripts)

### Разработка

| Команда                | Описание                                              |
| ---------------------- | ----------------------------------------------------- |
| `npm run setup`        | Установка всех зависимостей (Node + инструкция Python) |
| `npm run dev`          | Запуск DEV (DB + backend + frontend одновременно)      |
| `npm run frontend`     | Запуск только frontend (Vite dev server)               |
| `npm run dev:backend`  | Запуск только backend через `scripts/run.js`           |
| `npm run dev:migrate`  | Миграции БД с ожиданием Postgres                       |
| `npm run dev:kill`     | Остановка портов 8000, 5173                            |
| `npm run dev:restart`  | Перезапуск DEV-окружения                               |

### Docker

| Команда                    | Описание                          |
| -------------------------- | --------------------------------- |
| `npm run docker:dev:up`    | Поднять DEV-контейнеры            |
| `npm run docker:dev:down`  | Остановить DEV-контейнеры         |
| `npm run docker:dev:logs`  | Логи DEV-контейнеров              |
| `npm run docker:test:up`   | Поднять TEST-контейнеры           |
| `npm run docker:test:down` | Остановить TEST-контейнеры        |
| `npm run docker:test:logs` | Логи TEST-контейнеров             |
| `npm run docker:prod:up`   | Поднять PROD-контейнеры           |
| `npm run docker:prod:down` | Остановить PROD-контейнеры        |
| `npm run docker:prod:logs` | Логи PROD-контейнеров             |

### База данных

| Команда                | Описание                                        |
| ---------------------- | ----------------------------------------------- |
| `npm run db:wait`      | Ожидание готовности PostgreSQL                   |
| `npm run db:makemigrate` | Создание новой миграции Alembic (`-m "msg"`)  |

---

## E2E-тестирование (Playwright)

Проект использует [Playwright](https://playwright.dev/) для end-to-end тестирования.  
Конфигурация: `playwright.config.ts` (Chromium, baseURL: `http://localhost:5173`).

### Тестовые сьюты

Канон: [`e2e/AGENTS.md`](e2e/AGENTS.md). Один suite (legacy удалён).

| Команда                    | Охват                              | Файлы / match                                                            |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `npm run test:e2e:smoke`   | Smoke (tag `@smoke`)               | `e2e/smoke/*.spec.ts` + tagged specs                                     |
| `npm run test:e2e:ui`      | UI (tag `@ui`)                     | `e2e/ui/*.spec.ts`                                                       |
| `npm run test:e2e:api`     | API (tag `@api`)                   | `e2e/api/*.spec.ts`                                                      |
| `npm run test:e2e:auth`    | Auth (без storageState)            | `e2e/auth/*.spec.ts`                                                     |
| `npm run test:e2e:regression` | Полная регрессия                | setup + smoke + ui + api + auth                                          |

### Список тестов (кратко)

**Smoke** (`e2e/smoke/`): nav, structure, employees-crud, orders-list, timesheet-open, vacations-happy.

**UI** (`e2e/ui/`): structure-lifecycle, employees-lifecycle, vacations-basic, vacation-plan-fill, add-vacation-days, absences, timesheet.

**API** (`e2e/api/`): catalog, errors, employees-errors, order-type-letter, timesheet, vacation-periods-smoke, vacation-balance-smoke.

**Auth** (`e2e/auth/`): login.

---

## Makefile

Альтернативные команды через `make`:

| Цель              | Описание                                     |
| ----------------- | -------------------------------------------- |
| `make dev`        | Полный запуск DEV-окружения                   |
| `make db-up`      | Поднять БД                                   |
| `make db-down`    | Остановить БД                                |
| `make db-logs`    | Логи БД                                      |
| `make db-restart` | Перезапуск БД                                |
| `make db-clean`   | Полная очистка БД (volumes + data/)           |
| `make migrate`    | Применить миграции (`alembic upgrade head`)   |
| `make makemigrate MSG="..."` | Создать новую миграцию            |
| `make install-all` | Установить все зависимости                  |
| `make test-env-up` | Поднять TEST из дампа DEV-базы              |
| `make test-env-down` | Остановить TEST                           |
| `make test-env-rebuild` | Пересобрать TEST                       |

---

## Env-контракт

### Основные переменные

Шаблон: `.env.example`. Окружения: `.env.dev`, `.env.test`, `.env.prod`.

### OnlyOffice

| Переменная                       | Назначение                                       |
| -------------------------------- | ------------------------------------------------ |
| `PUBLIC_URL`                     | Браузерный URL OnlyOffice                        |
| `ONLYOFFICE_PUBLIC_URL`          | Браузерный URL OnlyOffice (альтернатива)         |
| `ONLYOFFICE_INTERNAL_URL`        | Внутренний URL (backend → OnlyOffice)            |
| `BACKEND_INTERNAL_CALLBACK_URL`  | Callback URL (OnlyOffice → backend)              |
| `APP_PUBLIC_URL`                 | Legacy fallback для обратной совместимости        |
