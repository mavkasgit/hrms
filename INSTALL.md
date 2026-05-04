# Установка HRMS с нуля

## 1. Клонирование

```bash
git clone https://github.com/mavkasgit/hrms.git
cd hrms
```

## 2. Проверка предусловий

- Docker Desktop установлен и запущен
- Node.js 20+ (для локальной разработки, не обязательно для Docker)
- Python 3.11+ (для локальной разработки, не обязательно для Docker)

## 3. Настройка .env файлов

Скопируй `.env.test` и `.env.prod` (уже есть в репозитории):

- `.env.test` — test среда
- `.env.prod` — prod среда

Если нужен другой IP — замени `host.docker.internal` на IP машины в compose файлах, или оставь как есть для локального доступа.

## 4. Запуск Test среды

```bash
docker compose -f infra/docker-compose.test.yml up -d --build
```

Первый запуск займёт 3-5 минут (скачивание образов, сборка backend/frontend).

Открыть: `http://localhost:5174`

## 5. Запуск Prod среды (опционально)

```bash
docker compose -f infra/docker-compose.prod.yml up -d --build
```

Открыть: `http://localhost:5175`

## 6. Проверка

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Должно быть 4 контейнера для каждой среды: postgres, onlyoffice, backend, frontend.

## 7. Остановка

```bash
# Test
docker compose -f infra/docker-compose.test.yml down

# Prod
docker compose -f infra/docker-compose.prod.yml down

# Полная очистка (данные удалятся)
docker compose -f infra/docker-compose.test.yml down -v
docker compose -f infra/docker-compose.prod.yml down -v
```

## Порты

| Сервис      | Test | Prod |
|-------------|------|------|
| Frontend    | 5174 | 5175 |
| Backend API | 8001 | 8002 |
| Postgres    | 5433 | 5434 |
| OnlyOffice  | 8086 | 8087 |

## Миграции БД

Запускаются автоматически при старте backend (`alembic upgrade head`).
