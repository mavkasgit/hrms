# HRMS — Система управления персоналом

Корпоративная HRMS-система для развертывания в локальной сети предприятия.

## Стек

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy (async), asyncpg, Alembic
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, Shadcn UI, React Query
- **Database:** PostgreSQL 15
- **Infrastructure:** Docker Compose

## Структура проекта

```
hrms/
├── backend/           # FastAPI приложение
│   └── app/
│       ├── api/       # Слой 1: Контроллеры (Routers)
│       ├── services/  # Слой 2: Бизнес-логика
│       ├── repositories/ # Слой 3: Доступ к БД
│       ├── models/    # SQLAlchemy модели
│       ├── schemas/   # Pydantic схемы
│       ├── core/      # Настройки, security, database
│       └── utils/     # Утилиты
├── frontend/          # React приложение
│   └── src/
│       ├── app/       # Глобальные провайдеры, роутер
│       ├── pages/     # Страницы
│       ├── features/  # Функциональные блоки
│       ├── entities/  # Бизнес-сущности
│       └── shared/    # Общие компоненты
└── infra/             # Docker и окружения
```

## Быстрый старт (Dev)

### 1. Клонирование и настройка

```bash
git clone <repository-url>
cd hrms
```

### 2. Установка зависимостей

**Шаг 1: Установи необходимое ПО**

Выполни эти команды в cmd (одну за другой):

```cmd
winget install Python.Python.3.11
```
Устанавливает Python 3.11 с pip (менеджер пакетов).

```cmd
winget install OpenJS.NodeJS
```
Устанавливает Node.js с npm (менеджер пакетов для JavaScript).

```cmd
winget install Docker.DockerDesktop
```
Устанавливает Docker Desktop (контейнеризация для БД и сервисов).

⚠️ **После установки Docker Desktop перезагрузи компьютер.**

**Шаг 2: Установи все зависимости проекта**

Выполни в терминале из корня проекта:

```bash
npx make install-all
```

Если `make` не установлен, выполни вручную:

```bash
pip install -r backend/requirements.txt
cd frontend
npm install
cd ..
npm install
```

### 3. Запуск через Docker Compose

```bash
make up          # Запуск всех сервисов
make down        # Остановка
make logs        # Просмотр логов
```

Сервисы:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5432
- API Docs: http://localhost:8000/docs

### 4. Локальная разработка (без Docker)

**Backend:**
```bash
make backend-install   # Установка зависимостей
make backend-run       # Запуск uvicorn
```

**Frontend:**
```bash
make frontend-install  # Установка зависимостей
make frontend-run      # Запуск Vite dev server
```

### 5. Миграции БД

```bash
make migrate           # Применить все миграции
make makemigrate MSG="description"  # Создать новую миграцию
```

## Окружения

| Окружение | ENV | База данных | JWT |
|-----------|-----|-------------|-----|
| Dev | dev | hrms_dev | Отключен (фейковый admin) |
| Test | test | hrms_test | Включен |
| Prod | prod | hrms_prod | Строгая проверка |

## Резервное копирование

```bash
make backup          # Создать backup файлов и БД
make restore DATE=20260403  # Восстановить из backup
```

## Лицензия

Внутренний проект предприятия.
