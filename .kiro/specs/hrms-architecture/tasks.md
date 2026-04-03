# HRMS — Файл задач

> Источник: Design Document + Requirements Document  
> Архитектура: FastAPI + React + PostgreSQL + Docker (монорепо)

---

## Спринт 1 — Инфраструктура и основа

### HRMS-001 — Инициализация монорепозитория ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Infra

- [x] Создать структуру папок: `backend/`, `frontend/`, `infra/`
- [x] Добавить `.gitignore` (исключить: `.env*`, `node_modules/`, `__pycache__/`, `data/`)
- [x] Создать `README.md` с описанием запуска
- [x] Создать файлы окружений: `.env.dev`, `.env.test`, `.env.prod` (шаблоны без секретов)
- [x] Создать `Makefile` с командами: up, down, migrate, backend-run, frontend-run
- [x] Создать `backend/app/__init__.py`

---

### HRMS-002 — Docker Compose (dev/test/prod) ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Infra

- [x] Написать `infra/docker-compose.dev.yml`:
  - Сервис `postgres` — образ `postgres:15-alpine`, порт `5432`, healthcheck `pg_isready`
  - Сервис `backend` — порт `8000`, volumes для `orders/`, `templates/`, `personal_files/`
  - Сервис `frontend` — Vite dev server через node:20-alpine, порт `5173`
- [x] Написать `infra/docker-compose.test.yml` (БД `hrms_test`)
- [x] Написать `infra/docker-compose.prod.yml` (порт БД только на `127.0.0.1`, restart: always)
- [x] Создать `backend/Dockerfile` (python:3.11-slim, uvicorn)
- [x] Создать `frontend/Dockerfile` (multi-stage: node build + nginx serve)
- [x] Создать `frontend/nginx.conf` (SPA routing + API proxy)

**Переменные окружения backend:**
```
DATABASE_URL=postgresql+asyncpg://hrms_user:hrms_pass@postgres:5432/hrms_dev
ENV=dev
ORDERS_PATH=/app/data/orders
TEMPLATES_PATH=/app/data/templates
PERSONAL_FILES_PATH=/app/data/personal
```

---

### HRMS-003 — FastAPI: инициализация проекта ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Backend / Core

- [x] Инициализировать проект с `requirements.txt` (+ httpx для тестирования)
- [x] Настроить `pydantic-settings` (`core/config.py`) со всеми переменными из дизайн-документа
- [x] Настроить асинхронное подключение к PostgreSQL: `create_async_engine` + `asyncpg` + `async_sessionmaker`
- [x] Настроить Alembic для работы с async-движком (`alembic/env.py` с `run_sync` паттерном)
- [x] Настроить структурированное логирование через `structlog` (`core/logging.py`)
- [x] Создать `GET /api/health` → `{"status": "ok"}`
- [x] Настроить CORS middleware в `main.py`

**Зависимости:** `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `pydantic-settings`, `structlog`

---

### HRMS-004 — Модели SQLAlchemy + первая миграция ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Backend / Models

- [x] Создать `models/base.py` — DeclarativeBase
- [x] `Employee` — все поля согласно дизайн-документу (tab_number PK, name, department, position, hire_date, birth_date, gender, citizenship, residency, pensioner, payment_form, rate, contract_start, contract_end, personal_number, insurance_number, passport_number, created_at, updated_at)
- [x] `Order` — id, order_number, order_type, tab_number (FK), order_date, created_date, file_path, notes
- [x] `OrderSequence` — year PK, last_number (для race-condition-safe нумерации)
- [x] `Vacation` — id, tab_number (FK), start_date, end_date, vacation_type, days_count, vacation_year, created_at, updated_at
- [x] `Reference` — id, category, value, order
- [x] `User` — id, username, password_hash, role, full_name, created_at + CHECK constraint на role
- [x] `UserRole` Enum (admin, hr_manager, hr_specialist)
- [x] Создать начальную миграцию `001_initial` (ручная, без БД)
- [x] Создать seed-миграцию `002_seed_admin` (admin/admin123)

---

### HRMS-005 — Инициализация Frontend ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Frontend

- [x] Инициализировать проект: React 18 + TypeScript + Vite (package.json, tsconfig, vite.config)
- [x] Установить и настроить TailwindCSS (tailwind.config.js, postcss.config.js)
- [x] Создать Shadcn UI компоненты вручную: Button, Input, Dialog, Alert, Skeleton, Table, EmptyState
- [x] Установить зависимости: `react-router-dom`, `@tanstack/react-query`, `axios`, `lucide-react`, `@radix-ui/*`
- [x] Создать структуру папок FSD: `app/`, `pages/`, `features/`, `entities/`, `shared/`
- [x] Настроить `QueryClientProvider` в `app/main.tsx`
- [x] Настроить Axios instance в `shared/api/axios.ts` (baseURL из `VITE_API_URL`, interceptor для JWT, 401 redirect)
- [x] Создать страницы: `DashboardPage`, `EmployeesPage`, `OrdersPage`, `VacationsPage`, `LoginPage`
- [x] Настроить React Router с боковой навигацией (`Sidebar`)
- [x] Создать `ErrorBoundary` компонент
- [x] Настроить CSS переменные для Shadcn темы (index.css)
- [x] Настроить `cn()` утилиту (tailwind-merge + clsx)

---

## Спринт 2 — Сотрудники (CRUD)

### HRMS-006 — Repository: Employee
**Приоритет:** Высокий  
**Слой:** Backend / Repository

Создать `repositories/employee_repository.py`:

- `get_by_tab_number(db, tab_number)` → `Optional[Employee]`
- `get_all(db, department?, page, per_page, sort_by?, sort_order)` → `(List[Employee], total)`
- `search(db, q)` → `List[Employee]` (поиск по ФИО с приоритетом, затем по tab_number)
- `create(db, data)` → `Employee`
- `update(db, tab_number, data)` → `Employee`
- `delete(db, tab_number)` → `bool`

> **ЗАПРЕЩЕНО:** бизнес-логика в этом слое.

---

### HRMS-007 — Service: Employee
**Приоритет:** Высокий  
**Слой:** Backend / Service

Создать `services/employee_service.py`:

- `get_all_employees(db, department?, page, per_page, sort_by?, sort_order)` → paginated response
- `get_by_tab_number(db, tab_number)` → `Employee` или raise `EmployeeNotFoundError`
- `search_employees(db, q)` → `List[Employee]`
- `create_employee(db, data: EmployeeCreate)` → `Employee` (проверка уникальности tab_number)
- `update_employee(db, tab_number, data: EmployeeUpdate)` → `Employee`
- `delete_employee(db, tab_number, keep_files)` → удалить сотрудника + файлы из `PERSONAL_FILES_PATH/{tab_number}/` (если `keep_files=false`), логировать удаление

> **ЗАПРЕЩЕНО:** прямые вызовы SQLAlchemy.

---

### HRMS-008 — API: Employee endpoints
**Приоритет:** Высокий  
**Слой:** Backend / API

Создать `api/employees.py` — все эндпоинты согласно дизайн-документу:

- `GET /api/employees` — список с пагинацией и фильтром по department
- `GET /api/employees/search?q=` — поиск (мин. 1 символ)
- `GET /api/employees/{tab_number}` — один сотрудник
- `POST /api/employees` — создать
- `PUT /api/employees/{tab_number}` — обновить
- `DELETE /api/employees/{tab_number}?keep_files=false` — удалить

Настроить DI через `Depends`. Формат ответа списка: `{items, total, page, per_page, total_pages}`.

---

### HRMS-009 — Pydantic схемы: Employee + валидация дат
**Приоритет:** Высокий  
**Слой:** Backend / Schemas

Создать `schemas/employee.py`:

- `EmployeeCreate`, `EmployeeUpdate`, `EmployeeResponse`
- Validators:
  - `birth_date` — не в будущем, не раньше 1900
  - `hire_date` — не раньше `birth_date + 16 лет`
  - `contract_end` — не раньше `contract_start`

---

### HRMS-010 — Frontend: сущность Employee
**Приоритет:** Высокий  
**Слой:** Frontend / entities

Создать `entities/employee/`:

- `types.ts` — TypeScript типы для Employee
- `api.ts` — функции вызова API через Axios
- `useEmployees.ts` — React Query хук для списка
- `useEmployee.ts` — хук для одного сотрудника

---

### HRMS-011 — Frontend: страница EmployeesPage
**Приоритет:** Высокий  
**Слой:** Frontend / pages

- Таблица сотрудников через Shadcn `Table`
- Фильтр по подразделению
- Пагинация
- Loading state: `Skeleton`
- Error state: `Alert`
- Empty state: кастомный `EmptyState`

---

### HRMS-012 — Обработка ошибок (Backend)
**Приоритет:** Высокий  
**Слой:** Backend / Core

Создать `core/exceptions.py`:

- `HRMSException(message, error_code)` — базовый класс
- `EmployeeNotFoundError`, `OrderNotFoundError`, `VacationNotFoundError`
- `DuplicateTabNumberError`, `VacationOverlapError`, `InsufficientVacationDaysError`

Создать `api/exception_handlers.py` — глобальный обработчик → `{detail, error_code, status_code}`.

---

## Спринт 3 — Приказы

### HRMS-013 — Repository: Order
**Приоритет:** Высокий  
**Слой:** Backend / Repository

Создать `repositories/order_repository.py`:

- `get_next_order_number(db, year)` — `SELECT FOR UPDATE` на `OrderSequence`, инкремент, формат `f"{n:02d}"`
- `create(db, data)` → `Order`
- `get_all(db, page, per_page, sort_by?, sort_order?, year?)` → paginated
- `get_recent(db, limit, year?)` → `List[Order]`
- `get_by_id(db, id)` → `Optional[Order]`
- `get_years(db)` → `List[int]`

---

### HRMS-014 — Service: Order + генерация документов
**Приоритет:** Высокий  
**Слой:** Backend / Service

Создать `services/order_service.py`:

- `create_order(db, data: OrderCreate)` — в одной транзакции:
  1. Получить/принять `order_number` (ручной или автогенерация через `get_next_order_number`)
  2. Найти сотрудника (raise 404 если нет)
  3. Создать папку `ORDERS_PATH/{year}/`
  4. Сгенерировать `.docx` через `python-docx` с таймаутом `DOCUMENT_GENERATION_TIMEOUT=60s` (`asyncio.wait_for` + `asyncio.to_thread`)
  5. Сохранить запись в БД
- `generate_and_save_document(order_number, order_data, employee, year_dir)`:
  - Имя файла: `Приказ_№{order_number}_к_{day}_{month}_{order_type_short}_{last_name}_{initials}.docx`
  - Замена всех плейсхолдеров (30+) из дизайн-документа в параграфах и таблицах
- `sync_orders(db, year?)` — синхронизация файлов с БД (парсинг имён файлов)

**Зависимости:** `python-docx`, `python-jose[cryptography]`

---

### HRMS-015 — Утилита: helper-функции
**Приоритет:** Средний  
**Слой:** Backend / Utils

Создать `utils/file_helpers.py`:

- `get_personal_files_dir(tab_number)` → `Path`
- `get_order_type_short(order_type)` → сокращение для имени файла
- `extract_name_parts(full_name)` → `(last_name, initials)`

---

### HRMS-016 — API: Order endpoints
**Приоритет:** Высокий  
**Слой:** Backend / API

Создать `api/orders.py`:

- `GET /api/orders/types`
- `GET /api/orders/template/{order_type}`
- `GET /api/orders/next-number?year=`
- `POST /api/orders`
- `GET /api/orders/recent?limit=&year=`
- `GET /api/orders/all?page=&per_page=&sort_by=&sort_order=&year=`
- `GET /api/orders/years`
- `GET /api/orders/log`
- `GET /api/orders/settings`
- `PUT /api/orders/settings`
- `POST /api/orders/sync?year=`
- `GET /api/orders/{order_id}/download`

---

### HRMS-017 — API: Templates endpoints
**Приоритет:** Средний  
**Слой:** Backend / API

Создать `api/templates.py`:

- `GET /api/templates` — список всех 7 шаблонов с `exists`, `file_size`, `last_modified`
- `GET /api/templates/{order_type}` — скачать
- `POST /api/templates/{order_type}` — загрузить (только `admin`)
- `PUT /api/templates/{order_type}` — обновить (только `admin`)
- `DELETE /api/templates/{order_type}` — удалить (только `admin`)

---

### HRMS-018 — Frontend: сущность Order + страница OrdersPage
**Приоритет:** Высокий  
**Слой:** Frontend

Создать `entities/order/`: `types.ts`, `api.ts`, `useOrders.ts`

Страница `OrdersPage`:
- Таблица приказов с фильтром по году
- Кнопка "Создать приказ" → feature `order-generation`
- Пагинация, loading/error/empty states

Создать `features/order-generation/`:
- Форма создания приказа (выбор сотрудника, тип, дата, номер)
- Автоподстановка следующего номера через `GET /api/orders/next-number`
- Поле для ручного ввода номера

---

## Спринт 4 — Отпуска и файлы

### HRMS-019 — Repository + Service + API: Vacation
**Приоритет:** Высокий  
**Слой:** Backend

`repositories/vacation_repository.py`:
- CRUD методы, `get_used_days(db, tab_number, year)`

`services/vacation_service.py`:
- `create_vacation` — валидация дат, проверка существования сотрудника, проверка пересечений, проверка лимита дней
- `calculate_available_days` — пропорциональный расчёт для сотрудников, принятых в середине года (28/12 * месяцы)
- `get_vacation_stats(db, tab_number)` → `{used_days, available_days, remaining_days}`

`api/vacations.py`:
- `GET/POST /api/vacations`
- `GET/PUT/DELETE /api/vacations/{id}`

---

### HRMS-020 — API: Files (фото + личные дела)
**Приоритет:** Средний  
**Слой:** Backend / API

Создать `api/files.py`:

**Фотографии:**
- `POST /api/employees/{tab_number}/photo` — только JPG/PNG, макс. 5 МБ, сохранить как `PERSONAL_FILES_PATH/{tab_number}/photo.jpg`
- `GET /api/employees/{tab_number}/photo`
- `DELETE /api/employees/{tab_number}/photo`

**Личные дела:**
- `POST /api/employees/{tab_number}/files` — макс. 10 МБ, проверка общего лимита 50 МБ
- `GET /api/employees/{tab_number}/files`
- `GET /api/employees/{tab_number}/files/{filename}`
- `DELETE /api/employees/{tab_number}/files/{filename}`

---

### HRMS-021 — Frontend: сущность Vacation + страница VacationsPage
**Приоритет:** Средний  
**Слой:** Frontend

Создать `entities/vacation/`: `types.ts`, `api.ts`, `useVacations.ts`

Страница `VacationsPage` + `features/vacation-calendar/`:
- Календарь или таблица отпусков
- Форма добавления отпуска
- Отображение статистики: использовано/доступно/остаток

---

## Спринт 5 — Аутентификация и пользователи

### HRMS-022 — Backend: аутентификация JWT
**Приоритет:** Высокий  
**Слой:** Backend / Core

Создать `core/security.py`:
- `create_access_token(data, expires_delta?)` — генерация JWT
- `verify_token(token)` — проверка JWT
- `hash_password(password)` / `verify_password(plain, hashed)` — через `passlib[bcrypt]`

Создать `core/auth.py` — зависимость `get_current_user`:
- `ENV=dev` → возвращает фейкового admin без проверки токена
- `ENV=test/prod` → строгая проверка JWT, `raise 401` при ошибке

---

### HRMS-023 — API: Auth + Users
**Приоритет:** Высокий  
**Слой:** Backend / API

`api/auth.py`:
- `POST /api/auth/login` → JWT + user info
- `POST /api/auth/logout`
- `GET /api/auth/me`

`api/users.py` (только `admin`):
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/{user_id}`
- `DELETE /api/users/{user_id}`

---

### HRMS-024 — Frontend: аутентификация
**Приоритет:** Высокий  
**Слой:** Frontend

Создать `entities/user/`: `types.ts`, `api.ts`, `useAuth.ts`

Создать `features/auth/`:
- `LoginPage` — форма входа
- Хранение JWT токена
- Добавление `Authorization: Bearer {token}` заголовка в Axios
- Редирект на `/login` при 401
- Контекст/хук `useCurrentUser`

---

## Спринт 6 — Аналитика, логирование и финализация

### HRMS-025 — API: Analytics
**Приоритет:** Средний  
**Слой:** Backend / API

Создать `api/analytics.py`:
- `GET /api/analytics/dashboard?department=` → total, male/female, by_department, by_position, avg_age, avg_tenure_months, contracts
- `GET /api/analytics/contracts?months_ahead=3` → список с приоритетами EXPIRED/HIGH/MEDIUM, группировка по месяцам
- `GET /api/analytics/birthdays?days_ahead=30` → ФИО, дата, days_until, возраст
- `GET /api/analytics/vacations` → статистика по каждому сотруднику

---

### HRMS-026 — Frontend: DashboardPage
**Приоритет:** Средний  
**Слой:** Frontend

Страница `DashboardPage`:
- Карточки с общей статистикой (total, м/ж, avg_age, avg_tenure)
- Список контрактов, истекающих в ближайшие 3 месяца (с приоритетами)
- Список ближайших дней рождений
- Loading/error/empty states для каждого блока

---

### HRMS-027 — Структурированное логирование
**Приоритет:** Средний  
**Слой:** Backend / Core

Настроить `core/logging.py` через `structlog`:
- `ENV=dev/test` → ConsoleRenderer
- `ENV=prod` → JSONRenderer + файл `/app/logs/hrms.log` с ротацией (`RotatingFileHandler`, `LOG_MAX_BYTES=10MB`, `LOG_BACKUP_COUNT=5`)

Middleware для логирования запросов: `method`, `path`, `status_code`, `duration_ms`, `user_id`.

Логировать: создание/обновление/удаление записей, загрузку файлов, ошибки БД.

---

### HRMS-028 — Проверка целостности при старте
**Приоритет:** Средний  
**Слой:** Backend / Core

Создать `core/startup.py`:
- `check_file_paths()` — проверить/создать `ORDERS_PATH`, `TEMPLATES_PATH`, `PERSONAL_FILES_PATH`; проверить права на запись; логировать результат
- `check_broken_file_links()` — найти приказы, у которых `file_path` не существует на диске; логировать предупреждение с количеством

Вызвать в `@app.on_event("startup")`.

---

### HRMS-029 — API: Maintenance
**Приоритет:** Низкий  
**Слой:** Backend / API

Создать `api/maintenance.py`:
- `POST /api/maintenance/fix-broken-links` (только `admin`) — попытаться найти файл по новому формату имени → обновить `file_path`; иначе удалить запись; вернуть `{fixed, deleted}`

---

### HRMS-030 — Frontend: ErrorBoundary + глобальные UI компоненты
**Приоритет:** Средний  
**Слой:** Frontend / shared

Создать:
- `app/ErrorBoundary.tsx` — `Component` с `getDerivedStateFromError`, отображает `Alert` с ошибкой
- `shared/ui/EmptyState.tsx` — иконка + заголовок + описание
- Обернуть все страницы в `ErrorBoundary`

---

### HRMS-031 — CORS и безопасность
**Приоритет:** Высокий  
**Слой:** Backend / Core

В `main.py`:
- Настроить `CORSMiddleware`: origins из `VITE_API_URL`, методы `GET/POST/PUT/DELETE/OPTIONS`, заголовки `Content-Type/Authorization`
- Настроить connection pool: `pool_size=20`, `max_overflow=10`, `pool_pre_ping=True`, `command_timeout=30`

---

### HRMS-032 — Справочники (References)
**Приоритет:** Низкий  
**Слой:** Backend

- Repository + Service + API для `Reference`
- `GET /api/employees/references/departments`
- `GET /api/employees/references/positions`

---

### HRMS-033 — Скрипт резервного копирования
**Приоритет:** Низкий  
**Слой:** Infra

Создать `infra/backup.sh`:
- `tar -czf` архив `./data/`
- `pg_dump` с gzip
- Удаление backup старше 30 дней
- Инструкция по добавлению в `cron` (запуск в 02:00)
- Задокументировать процедуру восстановления в `README.md`

---

## Сводная таблица задач

| ID | Задача | Слой | Приоритет | Спринт |
|----|--------|------|-----------|--------|
| HRMS-001 | Инициализация монорепо | Infra | Высокий | 1 |
| HRMS-002 | Docker Compose (dev/test/prod) | Infra | Высокий | 1 |
| HRMS-003 | FastAPI: инициализация + health check | Backend | Высокий | 1 |
| HRMS-004 | Модели SQLAlchemy + миграция | Backend | Высокий | 1 |
| HRMS-005 | Инициализация Frontend | Frontend | Высокий | 1 |
| HRMS-006 | Repository: Employee | Backend | Высокий | 2 |
| HRMS-007 | Service: Employee | Backend | Высокий | 2 |
| HRMS-008 | API: Employee endpoints | Backend | Высокий | 2 |
| HRMS-009 | Pydantic схемы Employee + валидация дат | Backend | Высокий | 2 |
| HRMS-010 | Frontend: entities/employee | Frontend | Высокий | 2 |
| HRMS-011 | Frontend: EmployeesPage | Frontend | Высокий | 2 |
| HRMS-012 | Обработка ошибок (exceptions) | Backend | Высокий | 2 |
| HRMS-013 | Repository: Order + OrderSequence | Backend | Высокий | 3 |
| HRMS-014 | Service: Order + генерация docx | Backend | Высокий | 3 |
| HRMS-015 | Утилиты: file_helpers | Backend | Средний | 3 |
| HRMS-016 | API: Order endpoints | Backend | Высокий | 3 |
| HRMS-017 | API: Templates endpoints | Backend | Средний | 3 |
| HRMS-018 | Frontend: entities/order + OrdersPage | Frontend | Высокий | 3 |
| HRMS-019 | Vacation: Repo + Service + API | Backend | Высокий | 4 |
| HRMS-020 | API: Files (фото + личные дела) | Backend | Средний | 4 |
| HRMS-021 | Frontend: entities/vacation + VacationsPage | Frontend | Средний | 4 |
| HRMS-022 | JWT аутентификация (security + get_current_user) | Backend | Высокий | 5 |
| HRMS-023 | API: Auth + Users | Backend | Высокий | 5 |
| HRMS-024 | Frontend: аутентификация + LoginPage | Frontend | Высокий | 5 |
| HRMS-025 | API: Analytics | Backend | Средний | 6 |
| HRMS-026 | Frontend: DashboardPage | Frontend | Средний | 6 |
| HRMS-027 | Структурированное логирование (structlog) | Backend | Средний | 6 |
| HRMS-028 | Проверка целостности при старте | Backend | Средний | 6 |
| HRMS-029 | API: Maintenance (fix-broken-links) | Backend | Низкий | 6 |
| HRMS-030 | Frontend: ErrorBoundary + EmptyState | Frontend | Средний | 6 |
| HRMS-031 | CORS + connection pool | Backend | Высокий | 6 |
| HRMS-032 | Справочники (References API) | Backend | Низкий | 6 |
| HRMS-033 | Скрипт резервного копирования | Infra | Низкий | 6 |