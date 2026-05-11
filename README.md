# HRMS

Корпоративная HRMS-система (FastAPI + React + PostgreSQL + OnlyOffice) с кроссплатформенным запуском для Linux/macOS/Windows.

## Стек

- Backend: Python 3.11+, FastAPI, SQLAlchemy (async), Alembic
- Frontend: React 18, TypeScript, Vite
- DB: PostgreSQL 15
- Infra: Docker Compose (`infra/compose`)

## Структура

```text
hrms/
├── backend/
├── frontend/
├── infra/
│   ├── compose/
│   │   ├── docker-compose.dev.yml
│   │   ├── docker-compose.test.yml
│   │   └── docker-compose.prod.yml
│   └── nginx/
│       └── default.conf
├── scripts/
│   ├── run.js
│   ├── run-backend.sh|ps1
│   ├── run-migrate.sh|ps1
│   └── wait-for-postgres.sh|ps1
├── .env.dev
├── .env.test
└── .env.prod
```

## Быстрый старт

### Подготовка

```bash
npm install
npm install --prefix frontend
pip install -r backend/requirements.txt
```

### DEV

DEV: Docker только для PostgreSQL + OnlyOffice, backend/frontend локально.

```bash
npm run docker:dev:up
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

### TEST

```bash
npm run docker:test:up
```

С туннелем:

```bash
npm run test:tunnel:up
```

- Entry URL: `http://localhost:8080`

### PROD

```bash
npm run docker:prod:up
```

С туннелем:

```bash
npm run prod:tunnel:up
```

- Entry URL: `http://localhost`

## Основные команды

- `npm run dev:backend` — запуск backend через `scripts/run.js`
- `npm run dev:migrate` — миграции с ожиданием DB
- `npm run docker:dev|test|prod:logs` — логи окружения
- `npm run docker:dev|test|prod:down` — остановка окружения

## Env-контракт OnlyOffice

- `PUBLIC_URL` / `ONLYOFFICE_PUBLIC_URL` — браузерные URL
- `ONLYOFFICE_INTERNAL_URL` — backend -> onlyoffice
- `BACKEND_INTERNAL_CALLBACK_URL` — onlyoffice -> backend callback/file URL
- `APP_PUBLIC_URL` — legacy fallback для обратной совместимости
