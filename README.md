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

### 2. Запуск через Docker Compose

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

### 3. Локальная разработка (без Docker)

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

### 4. Миграции БД

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
