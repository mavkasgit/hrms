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

### HRMS-004b — Миграция: поля аудита и архивации ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Backend / Models

- [x] Добавить поля в `Employee`: `is_archived`, `terminated_date`, `termination_reason`, `archived_by`, `archived_at`, `is_deleted`, `deleted_at`, `deleted_by`
- [x] Добавить поля во все модели: `is_deleted`, `deleted_at`, `deleted_by`
- [x] Создать модель `EmployeeAuditLog` (id, tab_number, action, changed_fields JSON, performed_by, performed_at, reason)
- [x] Убрать `cascade="delete-orphan"` из relationships Employee → Orders/Vacations
- [x] Создать миграцию `003_add_audit_fields`

---

### HRMS-006 — Repository: Employee ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Backend / Repository

- [x] `get_by_tab_number(db, tab_number)` → `Optional[Employee]`
- [x] `get_all(db, department?, status?, page, per_page, sort_by?, sort_order)` → `(List[Employee], total)`
- [x] `search(db, q)` → `List[Employee]` (поиск по ФИО с приоритетом, затем по tab_number)
- [x] `create(db, data)` → `Employee`
- [x] `update(db, tab_number, data)` → `Employee`
- [x] `archive(db, tab_number, user_id, reason)` → `Employee`
- [x] `restore(db, tab_number, user_id)` → `Employee`
- [x] `soft_delete(db, tab_number, user_id)` → `bool`
- [x] `hard_delete(db, tab_number)` → `bool`
- [x] `get_audit_log(db, tab_number)` → `List[EmployeeAuditLog]`
- [x] `get_departments(db)` → `List[str]`
- [x] `get_future_vacations(db, tab_number)` → `List[Vacation]`
- [x] `_add_audit_entry(...)` → `EmployeeAuditLog`

---

### HRMS-007 — Service: Employee ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Backend / Service

- [x] `get_all_employees(db, department?, status?, page, per_page, sort_by?, sort_order)` → paginated response
- [x] `get_by_tab_number(db, tab_number)` → `Employee` или raise `EmployeeNotFoundError`
- [x] `search_employees(db, q)` → `List[Employee]`
- [x] `create_employee(db, data, user_id)` → `Employee` (проверка уникальности tab_number + audit log)
- [x] `update_employee(db, tab_number, data, user_id)` → `Employee` (с отслеживанием изменений)
- [x] `archive_employee(db, tab_number, user_id, reason)` → `(Employee, warnings)`
- [x] `restore_employee(db, tab_number, user_id)` → `Employee`
- [x] `soft_delete_employee(db, tab_number, user_id)` → `bool`
- [x] `hard_delete_employee(db, tab_number, user_id)` → `bool`
- [x] `get_audit_log(db, tab_number)` → `List[EmployeeAuditLog]`
- [x] `get_archive_warnings(db, tab_number)` → `List[str]`
- [x] `get_departments(db)` → `List[str]`

---

### HRMS-008 — API: Employee endpoints ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Backend / API

- [x] `GET /api/employees` — список с пагинацией, фильтром по department и status
- [x] `GET /api/employees/search?q=` — поиск (мин. 1 символ)
- [x] `GET /api/employees/departments` — список подразделений
- [x] `GET /api/employees/{tab_number}` — один сотрудник
- [x] `POST /api/employees` — создать
- [x] `PUT /api/employees/{tab_number}` — обновить
- [x] `POST /api/employees/{tab_number}/archive` — уволить (с warnings)
- [x] `POST /api/employees/{tab_number}/restore` — восстановить
- [x] `GET /api/employees/{tab_number}/audit-log` — история изменений
- [x] `GET /api/employees/{tab_number}/warnings` — предупреждения перед увольнением
- [x] `DELETE /api/employees/{tab_number}?hard=false&confirm=false` — soft/hard delete

---

### HRMS-009 — Pydantic схемы: Employee + валидация дат ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Backend / Schemas

- [x] `EmployeeCreate`, `EmployeeUpdate`, `EmployeeResponse`
- [x] `EmployeeArchive` — схема для увольнения
- [x] `EmployeeListResponse` — пагинированный ответ
- [x] `EmployeeAuditLogResponse` — запись аудита
- [x] `EmployeeWarningsResponse` — предупреждения
- [x] Validators:
  - `birth_date` — не в будущем, не раньше 1900
  - `hire_date` — не раньше `birth_date + 16 лет`
  - `contract_end` — не раньше `contract_start`

---

### HRMS-010 — Frontend: сущность Employee ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Frontend / entities

- [x] `types.ts` — TypeScript типы для Employee, EmployeeAuditLog
- [x] `api.ts` — функции вызова API через Axios
- [x] `useEmployees.ts` — React Query хуки (useEmployees, useEmployee, useCreateEmployee, useUpdateEmployee, useArchiveEmployee, useRestoreEmployee, useDeleteEmployee, useEmployeeAuditLog, useDepartments)

---

### HRMS-011 — Frontend: страница EmployeesPage ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Frontend / pages

- [x] Таблица сотрудников через Shadcn `Table`
- [x] Переключатель статусов: Активные | В архиве | Все | Удалённые
- [x] Поиск по ФИО / табельному номеру
- [x] Пагинация
- [x] Loading state: `Skeleton`
- [x] Error state: `Alert`
- [x] Empty state: кастомный `EmptyState`
- [x] Форма создания/редактирования сотрудника (`features/employee-form`)
- [x] Диалог увольнения с подтверждением и причиной (`features/employee-archive`)
- [x] Диалог истории изменений (`features/employee-audit`)
- [x] Кнопки: редактировать, уволить, восстановить, удалить навсегда
- [x] Badge для статусов (Активен/В архиве/Удалён)

---

### HRMS-012 — Обработка ошибок (Backend) ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Backend / Core

- [x] `HRMSException(message, error_code)` — базовый класс
- [x] `NotFoundError` — базовый для 404
- [x] `EmployeeNotFoundError`, `OrderNotFoundError`, `VacationNotFoundError`
- [x] `DuplicateTabNumberError`
- [x] `EmployeeAlreadyArchivedError`, `EmployeeNotArchivedError`
- [x] `EmployeeDeletedError`
- [x] `VacationOverlapError`, `InsufficientVacationDaysError`
- [x] `EmployeeHasActiveProcessesError` (для предупреждений)
- [x] Глобальный обработчик → `{detail, error_code, status_code}`

---

### HRMS-012b — Исправление: автоматический commit транзакций БД ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Backend / Core

- [x] Добавлен автоматический `await db.commit()` в `get_db()` после успешного выполнения запроса
- [x] Добавлена обработка ошибок с `await db.rollback()` при исключениях
- [x] Исправлена критическая проблема где все изменения (create/update/delete) теряли после завершения запроса
- [x] Протестировано: редактирование, архивирование, восстановление сотрудников теперь сохраняются корректно

---

### HRMS-012c — Исправление: отправка только редактируемых полей в PUT запросе ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Frontend / features

- [x] Исправлена форма редактирования сотрудника (`features/employee-form/index.tsx`)
- [x] Теперь отправляются только поля из интерфейса `EmployeeUpdate` (исключены readonly: id, tab_number, created_at, updated_at, is_archived, is_deleted и т.д.)
- [x] Добавлено логирование отправляемых данных для отладки
- [x] Протестировано: изменения сотрудников теперь сохраняются корректно в БД

---

### HRMS-012b — Исправление: автоматический commit транзакций БД ✅ ВЫПОЛНЕНО
**Приоритет:** Критический  
**Слой:** Backend / Core

**Проблема:** Функция `get_db()` в `core/database.py` не делала commit транзакций. Все изменения (создание, обновление, удаление сотрудников) терялись после завершения запроса, хотя API возвращал 200 OK.

**Решение:**
- [x] Добавлен автоматический `await session.commit()` после успешного выполнения запроса
- [x] Добавлена обработка ошибок с `await session.rollback()` при исключениях
- [x] Теперь все операции с БД сохраняются корректно

**Тестирование:** Все CRUD операции (создание, редактирование, архивирование, восстановление) работают корректно и данные сохраняются в БД.

---

### HRMS-012c — Исправление: отправка только редактируемых полей в PUT запросе ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий  
**Слой:** Frontend / features

**Проблема:** Форма редактирования сотрудника отправляла весь объект `Employee` (включая readonly поля: `id`, `tab_number`, `created_at`, `updated_at`, `is_archived` и т.д.). Хотя бэкенд использовал `model_dump(exclude_unset=True)`, Pydantic считал все поля "set", что приводило к неправильной обработке.

**Решение:**
- [x] Исправлена функция `handleSubmit` в `frontend/src/features/employee-form/index.tsx`
- [x] Теперь отправляются только редактируемые поля согласно интерфейсу `EmployeeUpdate`:
  - `name`, `department`, `position`
  - `hire_date`, `birth_date`, `gender`
  - `citizenship`, `residency`, `pensioner`
  - `payment_form`, `rate`
  - `contract_start`, `contract_end`
  - `personal_number`, `insurance_number`, `passport_number`
- [x] Исключены readonly поля: `id`, `tab_number`, `created_at`, `updated_at`, `is_archived`, `is_deleted` и т.д.

**Тестирование:** Редактирование сотрудников через UI теперь работает корректно, изменения сохраняются в БД и отображаются в таблице.

---

## Спринт 3 — Приказы

### HRMS-013 — Repository: Order ✅ ВЫПОЛНЕНО
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

### HRMS-014 — Service: Order + генерация документов ✅ ВЫПОЛНЕНО
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

### HRMS-015 — Утилита: helper-функции ✅ ВЫПОЛНЕНО
**Приоритет:** Средний  
**Слой:** Backend / Utils

Создать `utils/file_helpers.py`:

- `get_personal_files_dir(tab_number)` → `Path`
- `get_order_type_short(order_type)` → сокращение для имени файла
- `extract_name_parts(full_name)` → `(last_name, initials)`

---

### HRMS-016 — API: Order endpoints ✅ ВЫПОЛНЕНО
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

### HRMS-017 — API: Templates endpoints ✅ ВЫПОЛНЕНО
**Приоритет:** Средний  
**Слой:** Backend / API

Создать `api/templates.py`:

- `GET /api/templates` — список всех 7 шаблонов с `exists`, `file_size`, `last_modified`
- `GET /api/templates/{order_type}` — скачать
- `POST /api/templates/{order_type}` — загрузить (только `admin`)
- `PUT /api/templates/{order_type}` — обновить (только `admin`)
- `DELETE /api/templates/{order_type}` — удалить (только `admin`)

---

### HRMS-018 — Frontend: сущность Order + страница OrdersPage ✅ ВЫПОЛНЕНО
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
- Динамические дополнительные поля в зависимости от типа приказа
- Боковая панель (300px) с доп. полями (даты, кол-во дней)

---

## Спринт 4 — Отпуска и файлы

### HRMS-019a — Миграция: vacation_days_override + position_vacation_config + holidays ✅ ВЫПОЛНЕНО
**Приоритет:** 🔴 Критический
**Слой:** Backend / Models

- [x] Добавить поле `vacation_days_override: Optional[int]` в модель `Employee` — персональный override дней отпуска
- [x] Добавить поле `vacation_days_correction: Optional[int]` в модель `Employee` — ручная поправка для расчёта остатка
- [x] Создать модель `PositionVacationConfig`:
  - `id` (PK), `position` (String, unique), `days` (Integer), `created_at`, `updated_at`
  - Хранит сколько дней отпуска положено для каждой должности
- [x] Создать модель `Holiday`:
  - `id` (PK), `date` (Date, unique), `name` (String), `year` (Integer)
  - Хранит праздничные дни которые не считаются за дни отпуска
  - Seed: стандартные праздники (1-8 янв, 7 янв, 8 мар, 1 мая, 9 мая, 3 июля, 7 нояб, 25 дек)
- [x] Создать объединённую миграцию `003_vacation_management` (включает vacation поля, order_id, is_cancelled, holidays)

**Логика расчёта доступных дней:**
```
доступно = employee.vacation_days_override 
        или position_vacation_config.days (по должности) 
        или 28 (дефолт)
```

**Логика расчёта дней отпуска:**
```
дни = (end_date - start_date + 1) - count(holidays between start and end)
```

---

### HRMS-019b — Утилита: working_days.py ✅ ВЫПОЛНЕНО
**Приоритет:** 🔴 Критический
**Слой:** Backend / Utils

Создать `utils/working_days.py`:

- [x] `calculate_vacation_days(start_date, end_date, holidays=[])` → int
  - Считает календарные дни между датами минус праздники
  - Пример: 10 дней календарных, 2 праздника внутри = 8 дней отпуска
- [x] `count_holidays_in_range(start_date, end_date, db)` → int
  - Запрос к БД для подсчёта праздников в диапазоне
- [x] `get_holidays_for_year(year, db)` → List[Holiday]
  - Вернуть все праздники за год

**Правила:**
- Праздничные дни НЕ считаются за дни отпуска
- Если отпуск попадает на праздник — этот день вычитается из общего количества
- Выходные (суббота/воскресенье) считаются за дни отпуска (календарный подход)

---

### HRMS-019c — Repository: Vacation ✅ ВЫПОЛНЕНО
**Приоритет:** 🔴 Критический
**Слой:** Backend / Repository

Создать `repositories/vacation_repository.py`:

- [x] `create(db, data)` → `Vacation`
- [x] `get_by_id(db, id)` → `Optional[Vacation]`
- [x] `get_all(db, employee_id?, year?, vacation_type?, page, per_page)` → `(List[Vacation], total)`
- [x] `get_by_employee_id(db, employee_id, year?)` → `List[Vacation]`
- [x] `update(db, id, data)` → `Vacation`
- [x] `soft_delete(db, id, user_id)` → bool
- [x] `hard_delete(db, id)` → bool
- [x] `get_used_days(db, employee_id, year)` → int
- [x] `get_vacation_balance(db, employee_id, year)` → dict
- [x] `get_employees_summary(db, q?, archive_filter?)` → List[Dict] (новый метод для summary-таблицы)
- [x] `get_employee_vacation_history(db, employee_id)` → Dict (новый метод для истории по годам)
- [x] `cancel(db, id, user_id)` → bool (отмена отпуска)

---

### HRMS-019d — Service: Vacation
**Приоритет:** 🔴 Критический  
**Слой:** Backend / Service

Создать `services/vacation_service.py`:

- `create_vacation(db, data, user_id)` → `Vacation`
  - Проверить что сотрудник существует
  - Проверить что end_date >= start_date
  - Проверить что нет пересечения с другим отпуском ЭТОГО ЖЕ сотрудника
  - Рассчитать days_count через `calculate_vacation_days()` (календарные - праздники)
  - Для "Трудового" отпуска — проверить что хватает доступных дней
  - Для "За свой счет" — без проверки лимита
  - Создать запись, добавить audit log
- `update_vacation(db, id, data, user_id)` → `Vacation`
  - Те же проверки что при создании
  - Пересчитать days_count если даты изменились
- `delete_vacation(db, id, user_id, hard=False)` → bool
- `calculate_available_days(db, employee_id)` → int
  - Получить доступные дни: override → по должности → 28
  - Вычесть использованные дни за текущий год
- `get_vacation_balance(db, employee_id)` → dict
  - `{available_days, used_days, remaining_days, position, override}`
- `get_vacation_stats(db, employee_id)` → dict
  - Детальная статистика по типам и годам

**Валидации:**
- `start_date` не в прошлом
- `end_date` >= `start_date`
- Для "Трудового": `used_days + new_days <= available_days`
- Пересечение отпусков только у одного сотрудника (не блокировать, но проверять)

---

### HRMS-019e — API: Vacation endpoints
**Приоритет:** 🔴 Критический  
**Слой:** Backend / API

Создать `api/vacations.py`:

- `GET /api/vacations?employee_id=&year=&vacation_type=&page=&per_page=` — список с фильтрами
- `POST /api/vacations` — создать отпуск
- `GET /api/vacations/{id}` — один отпуск
- `PUT /api/vacations/{id}` — обновить
- `DELETE /api/vacations/{id}?hard=false` — удалить
- `GET /api/vacations/stats?employee_id=` — статистика по сотруднику
- `GET /api/employees/{id}/vacation-balance` — баланс конкретного сотрудника (доступно/использовано/остаток)
- `GET /api/references/vacation-days-by-position` — справочник дней по должностям
- `PATCH /api/references/vacation-days-by-position` — настроить дни для должности (admin)
- `GET /api/references/holidays?year=` — список праздников
- `POST /api/references/holidays` — добавить праздник (admin)
- `DELETE /api/references/holidays/{id}` — удалить праздник (admin)

**Схемы Pydantic:**
- `VacationCreate`: employee_id, start_date, end_date, vacation_type
- `VacationUpdate`: start_date?, end_date?, vacation_type?
- `VacationResponse`: id, employee_id, employee_name, start_date, end_date, vacation_type, days_count, created_at
- `VacationListResponse`: items, total, page, per_page
- `VacationBalanceResponse`: available_days, used_days, remaining_days, vacation_type_breakdown
- `PositionVacationConfigResponse`: position, days
- `HolidayResponse`: id, date, name, year

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

### HRMS-021a — Frontend: сущность Vacation
**Приоритет:** 🔴 Критический  
**Слой:** Frontend / entities

Создать `entities/vacation/`:

**types.ts:**
```typescript
interface Vacation {
  id: number
  employee_id: number
  employee_name: string
  start_date: string
  end_date: string
  vacation_type: "Трудовой" | "За свой счет"
  days_count: number
  created_at: string
}

interface VacationBalance {
  available_days: number
  used_days: number
  remaining_days: number
  vacation_type_breakdown: Record<string, number>
}

interface VacationCreate {
  employee_id: number
  start_date: string
  end_date: string
  vacation_type: string
}

interface PositionVacationConfig {
  position: string
  days: number
}

interface Holiday {
  id: number
  date: string
  name: string
  year: number
}
```

**api.ts:**
- `getVacations(params)` — список с фильтрами
- `createVacation(data)` — создать
- `updateVacation(id, data)` — обновить
- `deleteVacation(id, hard?)` — удалить
- `getVacationBalance(employeeId)` — баланс
- `getPositionVacationConfig()` — справочник дней по должностям
- `setPositionVacationConfig(position, days)` — настроить
- `getHolidays(year?)` — праздники
- `addHoliday(date, name)` — добавить праздник
- `deleteHoliday(id)` — удалить праздник

**useVacations.ts:**
- `useVacations(params)` — React Query хук
- `useVacationBalance(employeeId)` — баланс
- `useCreateVacation()` — мутация создания
- `useUpdateVacation()` — мутация обновления
- `useDeleteVacation()` — мутация удаления
- `usePositionVacationConfig()` — справочник
- `useHolidays(year?)` — праздники

---

### HRMS-021b — Frontend: страница VacationsPage
**Приоритет:** 🔴 Критический  
**Слой:** Frontend / pages

Страница `VacationsPage`:

- Таблица отпусков с колонками: Сотрудник, Тип, Начало, Конец, Дней, Дата создания, Действия
- Фильтры:
  - По сотруднику (поиск по ФИО)
  - По году (выпадающий список)
  - По типу отпуска (Трудовой / За свой счет / Все)
- Пагинация
- Loading state: Skeleton
- Error state: Alert
- Empty state: EmptyState
- Кнопка "Добавить отпуск" → открывает диалог
- Кнопки в строке: редактировать, удалить
- **Export CSV** — кнопка экспорта текущей таблицы в CSV файл
- **Карточки статистики** сверху:
  - Доступно дней (для выбранного сотрудника/года)
  - Использовано
  - Остаток

---

### HRMS-021c — Frontend: форма создания/редактирования отпуска
**Приоритет:** 🔴 Критический  
**Слой:** Frontend / features

Создать `features/vacation-form/`:

- Диалог с формой:
  - Выбор сотрудника (поиск по ФИО, autocomplete)
  - Тип отпуска (выпадающий список: Трудовой / За свой счет)
  - Дата начала (DatePicker)
  - Дата конца (DatePicker)
  - Автоматический расчёт дней (показывает "X календарных дней, Y праздников = Z дней отпуска")
- **Баланс сотрудника** — при выборе сотрудника сразу показывать:
  - `Доступно: 28 дн. | Использовано: 12 дн. | Остаток: 16 дн.`
  - Если "Трудовой" и дней не хватает — показать предупреждение и заблокировать создание
- Валидация:
  - Сотрудник обязателен
  - Тип отпуска обязателен
  - Дата начала обязательна, не в прошлом
  - Дата конца обязательна, >= даты начала
- При изменении дат — пересчёт дней и обновление баланса

---

### HRMS-021d — Frontend: Сайдбар + роутинг
**Приоритет:** 🟡 Should  
**Слой:** Frontend / app

- Добавить пункт "Отпуска" в боковую навигацию (Sidebar)
- Иконка: `Calendar` из lucide-react
- Роут: `/vacations` → `VacationsPage`
- Обновить Layout.tsx

---

### HRMS-021e — Frontend: страница настройки справочника
**Приоритет:** 🟢 Nice  
**Слой:** Frontend / pages

Страница или диалог настройки дней отпуска по должностям:

- Таблица: Должность | Дней отпуска | Действия
- Кнопка "Добавить должность"
- Inline редактирование (клик по ячейке → input)
- Кнопка "Сохранить"
- Справочник праздников:
  - Таблица: Дата | Название | Год | Действия
  - Кнопка "Добавить праздник"
  - Inline редактирование

---

---

## Спринт 5 — Дашборд, исправления номеров приказов, DevOps

### HRMS-022a — Backend: AnalyticsService ✅ ВЫПОЛНЕНО
**Приоритет:** Средний
**Слой:** Backend / Service

Создать `services/analytics_service.py`:

- [x] `get_dashboard_stats(db, department?)` — общая статистика (total, male_count, female_count, avg_age, avg_tenure)
- [x] `get_upcoming_birthdays(db, days=30)` — ближайшие дни рождения с сортировкой по близости
- [x] `get_contract_expiring(db, department?)` — все контракты (просроченные, активные, без даты)
- [x] `get_department_distribution(db, department?)` — распределение по отделам или должностям
- [x] Учёт `is_deleted=false`, `is_archived=false` для всех запросов
- [x] Опциональная фильтрация по department

---

### HRMS-022b — Backend: API /api/analytics ✅ ВЫПОЛНЕНО
**Приоритет:** Средний
**Слой:** Backend / API

Создать `api/analytics.py`:

- [x] `GET /api/analytics/dashboard?department=` — общая статистика
- [x] `GET /api/analytics/birthdays?days=30` — дни рождения
- [x] `GET /api/analytics/contracts?department=` — все контракты
- [x] `GET /api/analytics/departments?department=` — распределение
- [x] Зарегистрировать роутер в `main.py`

---

### HRMS-022c — Frontend: компоненты Dashboard ✅ ВЫПОЛНЕНО
**Приоритет:** Средний
**Слой:** Frontend / features

Создать `features/dashboard/`:

**types.ts:**
- [x] `DashboardStats`, `Birthday`, `ContractExpiring`, `DepartmentCount`

**api.ts:**
- [x] `fetchDashboardStats()`, `fetchBirthdays()`, `fetchContracts()`, `fetchDepartmentDistribution()`

**components:**
- [x] `StatCard.tsx` — компактная карточка (p-3, text-xl, иконка)
- [x] `BirthdaysList.tsx` — список с иконками отделов (Building2/Factory), цветовая маркировка
- [x] `ContractsTable.tsx` — фильтры 3 мес/Все, тоглы отделов, группировка по месяцам, статусы
- [x] `DepartmentChart.tsx` — BarChart через recharts

**Добавлен компонент:**
- [x] `shared/ui/card.tsx` — Card, CardHeader, CardTitle, CardContent, CardFooter

---

### HRMS-022d — Frontend: DashboardPage ✅ ВЫПОЛНЕНО
**Приоритет:** Средний
**Слой:** Frontend / pages

- [x] 5 StatCards: всего сотрудников, мужчины, женщины, ср. возраст, ср. стаж
- [x] BirthdaysList (500px) + ContractsTable (690px) в одной строке
- [x] DepartmentChart внизу
- [x] Заглушка выпадающего списка отделов (удалена из-за бага с department/position)
- [x] Компактные карточки (p-3, text-xl, leading-tight)

---

### HRMS-023 — Исправление: номер приказа из последнего по ID ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий
**Слой:** Backend / Repository

**Проблема:** OrderSequence инкрементировал номер при каждом вызове `/orders/next-number`, включая просмотры. Это создавало «улетающие» номера и расхождения с фронтом.

**Решение:**
- [x] Убран OrderSequence из `get_next_order_number()`
- [x] Теперь номер = последний приказ по ID (ORDER BY id DESC LIMIT 1) + 1
- [x] Если заказов нет — возвращается "01"
- [x] Исключён unused import OrderSequence

---

### HRMS-024 — Исправление: VacationsPage использует computeNextOrderNumber ✅ ВЫПОЛНЕНО
**Приоритет:** Высокий
**Слой:** Frontend / pages

**Проблема:** VacationsPage использовала `useNextOrderNumber` (API из OrderSequence), а OrdersPage — `computeNextOrderNumber` (из фактических заказов). Это создавало разные номера.

**Решение:**
- [x] VacationsPage теперь использует `useRecentOrders` + `computeNextOrderNumber`
- [x] Оба файла считают номер одинаково: последний по ID + 1
- [x] `computeNextOrderNumber` изменён на сортировку по ID (а не по дате)

---

### HRMS-025 — Улучшение DevOps ✅ ВЫПОЛНЕНО
**Приоритет:** Средний
**Слой:** Infra

- [x] `install:all` — предварительная установка зависимостей фронтенда
- [x] `concurrently --restart-tries 5 --restart-after 1000` — автоподъём упавших процессов
- [x] `uvicorn --reload-dir app --reload-include "*.py"` — надёжный hot-reload
- [x] `frontend: npx vite` — явный запуск без npm install в процессе
- [x] Добавлен `recharts` в зависимости
- [x] Добавлен tailwind safelist для цветов отделов

---

### HRMS-026 — Удалена колонка табельного номера из OrdersPage ✅ ВЫПОЛНЕНО
**Приоритет:** Низкий
**Слой:** Frontend / pages

- [x] Удалён `<TableHead>Таб. №</TableHead>`
- [x] Удалён `<TableCell>{order.tab_number}</TableCell>`

---

## Сводная таблица задач

| ID | Задача | Слой | Приоритет | Спринт | Статус |
|----|--------|------|-----------|--------|--------|
| HRMS-001 | Инициализация монорепо | Infra | Высокий | 1 | ✅ |
| HRMS-002 | Docker Compose (dev/test/prod) | Infra | Высокий | 1 | ✅ |
| HRMS-003 | FastAPI: инициализация + health check | Backend | Высокий | 1 | ✅ |
| HRMS-004 | Модели SQLAlchemy + миграция | Backend | Высокий | 1 | ✅ |
| HRMS-004b | Миграция: поля аудита и архивации | Backend/Models | Высокий | 2 | ✅ |
| HRMS-005 | Инициализация Frontend | Frontend | Высокий | 1 | ✅ |
| HRMS-006 | Repository: Employee | Backend | Высокий | 2 | ✅ |
| HRMS-007 | Service: Employee | Backend | Высокий | 2 | ✅ |
| HRMS-008 | API: Employee endpoints | Backend | Высокий | 2 | ✅ |
| HRMS-009 | Pydantic схемы Employee + валидация дат | Backend | Высокий | 2 | ✅ |
| HRMS-010 | Frontend: entities/employee | Frontend | Высокий | 2 | ✅ |
| HRMS-011 | Frontend: EmployeesPage | Frontend | Высокий | 2 | ✅ |
| HRMS-012 | Обработка ошибок (exceptions) | Backend | Высокий | 2 | ✅ |
| HRMS-012b | Исправление: автоматический commit транзакций БД | Backend | Высокий | 2 | ✅ |
| HRMS-012c | Исправление: отправка только редактируемых полей в PUT | Frontend | Высокий | 2 | ✅ |
| HRMS-013 | Repository: Order + OrderSequence | Backend | Высокий | 3 | ✅ |
| HRMS-014 | Service: Order + генерация docx | Backend | Высокий | 3 | ✅ |
| HRMS-015 | Утилиты: file_helpers | Backend | Средний | 3 | ✅ |
| HRMS-016 | API: Order endpoints | Backend | Высокий | 3 | ✅ |
| HRMS-017 | API: Templates endpoints | Backend | Средний | 3 | ✅ |
| HRMS-018 | Frontend: entities/order + OrdersPage | Frontend | Высокий | 3 | ✅ |
| HRMS-019a | Миграция: vacation_days_override + position_vacation_config + holidays | Backend | 🔴 Критический | 4 | ✅ |
| HRMS-019b | Утилита: working_days.py | Backend | 🔴 Критический | 4 | ✅ |
| HRMS-019c | Repository: Vacation | Backend | 🔴 Критический | 4 | ✅ |
| HRMS-019d | Service: Vacation | Backend | 🔴 Критический | 4 | ✅ |
| HRMS-019e | API: Vacation endpoints (12 эндпоинтов) | Backend | 🔴 Критический | 4 | ✅ |
| HRMS-020 | API: Files (фото + личные дела) | Backend | Средний | 4 | |
| HRMS-021a | Frontend: entities/vacation | Frontend | 🔴 Критический | 4 | ✅ |
| HRMS-021b | Frontend: VacationsPage + Export CSV | Frontend | 🔴 Критический | 4 | ✅ |
| HRMS-021c | Frontend: VacationForm с балансом | Frontend | 🔴 Критический | 4 | ✅ |
| HRMS-021d | Frontend: Сайдбар + роутинг | Frontend | 🟡 Should | 4 | ✅ |
| HRMS-021e | Frontend: Страница настройки справочника | Frontend | 🟢 Nice | 4 | ✅ |
| HRMS-022a | Dashboard: Backend AnalyticsService | Backend | Средний | 5 | ✅ |
| HRMS-022b | Dashboard: API /api/analytics (4 эндпоинта) | Backend | Средний | 5 | ✅ |
| HRMS-022c | Dashboard: Frontend компоненты (StatCard, BirthdaysList, ContractsTable, DepartmentChart) | Frontend | Средний | 5 | ✅ |
| HRMS-022d | Dashboard: DashboardPage с полным функционалом | Frontend | Средний | 5 | ✅ |
| HRMS-023 | Исправление: номер приказа из последнего по ID вместо OrderSequence | Backend | Высокий | 5 | ✅ |
| HRMS-024 | Исправление: VacationsPage использует computeNextOrderNumber | Frontend | Высокий | 5 | ✅ |
| HRMS-025 | Улучшение DevOps: restart-tries, install:all, hot-reload | Infra | Средний | 5 | ✅ |
| HRMS-026 | Удалена колонка табельного номера из OrdersPage | Frontend | Низкий | 5 | ✅ |
| HRMS-027 | JWT аутентификация (security + get_current_user) | Backend | Высокий | 6 | |
| HRMS-028 | API: Auth + Users | Backend | Высокий | 6 | |
| HRMS-029 | Frontend: аутентификация + LoginPage | Frontend | Высокий | 6 | |
| HRMS-030 | Структурированное логирование (structlog) | Backend | Средний | 6 | |
| HRMS-031 | Проверка целостности при старте | Backend | Средний | 6 | |
| HRMS-032 | API: Maintenance (fix-broken-links) | Backend | Низкий | 6 | |
| HRMS-033 | Frontend: ErrorBoundary + EmptyState | Frontend | Средний | 6 | |
| HRMS-034 | CORS + connection pool | Backend | Высокий | 6 | |
| HRMS-035 | Справочники (References API) | Backend | Низкий | 6 | |
| HRMS-036 | Скрипт резервного копирования | Infra | Низкий | 6 | |