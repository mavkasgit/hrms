# Getting Started

## Требования к окружению

Для успешного локального запуска и разработки HRMS вам понадобятся:
- **Node.js**: Версия 20+
- **Python**: Версия 3.11+ (для локального запуска backend)
- **Docker + Docker Compose**: Для СУБД PostgreSQL и Document Server OnlyOffice

---

## Быстрый старт (dev-режим, локально)

В dev-режиме база данных PostgreSQL и OnlyOffice запускаются в Docker-контейнерах, а бэкенд и фронтенд работают локально на хост-машине.

### Шаг 1. Клонирование репозитория и установка зависимостей

```bash
# Клонируйте репозиторий (если еще не клонирован)
git clone https://github.com/mavkasgit/hrms.git
cd hrms

# Установка всех Node-зависимостей (корень + frontend)
npm run setup

# Установка Python-зависимостей для backend
pip install -r backend/requirements.txt
```

> **Примечание:** Скрипт `npm run setup` автоматически выполнит `npm install` в корневом каталоге и в папке `frontend`.

### Шаг 2. Настройка переменных окружения

Скопируйте настройки по умолчанию в файл `.env.dev`:
```bash
cp .env.example .env.dev
```
Файл `.env.dev` уже преднастроен на локальный запуск бэкенда (порт 8000) и фронтенда (порт 5173), а также обращение к БД и OnlyOffice в Docker (порт 5432 и 8085 соответственно). При необходимости отредактируйте параметры подключения в `.env.dev`.

### Шаг 3. Запуск dev-окружения

Выполните команду для комплексного запуска:
```bash
npm run dev
```

Эта команда последовательно делает следующее (благодаря хуку `predev`):
1. Проверяет, свободны ли dev-порты **8000** (backend) и **5173** (frontend).  
   Если заняты (часто зомби uvicorn/vite) — в интерактивном терминале предложит **убить process tree** (`taskkill /T` на Windows).  
   Non-interactive: `npm run dev:kill` или `HRMS_DEV_KILL=1 npm run dev`.
2. Поднимает контейнеры PostgreSQL и OnlyOffice: `npm run docker:dev:up`.
3. Ожидает готовности базы данных к подключениям: `npm run db:wait`.
4. Применяет все Alembic-миграции: `npm run dev:migrate`.
5. Запускает параллельно (через `concurrently`):
   - Логи контейнеров базы данных
   - Локальный Uvicorn сервер для бэкенда (`npm run dev:backend`)
   - Локальный Vite dev-сервер для фронтенда (`npm run frontend`)

### Порты заняты / WinError 10048

| Команда | Назначение |
|---------|------------|
| `npm run dev:ports` | Только проверка (exit 1, если занято) |
| `npm run dev:kill` | Освободить 8000/5173 (process **tree**, не один PID) |
| `npm run dev:restart` | kill + полный `dev` |
| `HRMS_DEV_KILL=1 npm run dev` | auto-kill без вопроса |

> Старый `npx kill-port` на Windows **не** убивал дерево процессов — сироты uvicorn оставались на порту.

### Адреса сервисов после запуска:
- **Frontend (React)**: `http://localhost:5173`
- **Backend API**: `http://localhost:8000`
- **API Swagger Docs**: `http://localhost:8000/docs`
- **OnlyOffice Document Server**: `http://localhost:8085`

---

## Использование скрипта `scripts/run.js`

Для кроссплатформенного запуска служебных команд используется скрипт-обертка `scripts/run.js`. Вы можете вызывать его напрямую через `node scripts/run.js <команда> <аргументы>` или через npm-скрипты.

### Команды:
1. **`run-backend`**
   Запускает локальный сервер разработки FastAPI.
   - *Команда*: `node scripts/run.js run-backend` (или `npm run dev:backend`)
   - *Как работает*: Ищет и запускает `scripts/run-backend.ps1` на Windows или `scripts/run-backend.sh` на Linux.

2. **`run-migrate`**
   Применяет миграции Alembic к базе данных, дождавшись доступности БД.
   - *Команда*: `node scripts/run.js run-migrate` (или `npm run dev:migrate` / `npm run db:migrate`)

3. **`wait-for-postgres`**
   Ожидает доступности порта БД перед тем, как выполнять какие-либо команды миграций или старта бэкенда.
   - *Команда*: `node scripts/run.js wait-for-postgres <host> <user> <timeout_in_sec>`
   - *Пример в package.json*: `node scripts/run.js wait-for-postgres hrms-postgres hrms_user 60` (вызывается во время старта dev-режима).

---

## Другие полезные команды разработки

- **Сброс и очистка портов**:
  Если порты 8000 или 5173 оказались заняты предыдущими зависшими процессами, очистите их:
  ```bash
  npm run dev:kill
  ```

- **Перезапуск окружения**:
  Очищает порты и запускает `npm run dev` заново:
  ```bash
  npm run dev:restart
  ```

- **Работа с миграциями БД (Alembic)**:
  После изменения SQLAlchemy моделей в `backend/app/models/` создайте новую миграцию:
  ```bash
  npm run db:makemigrate -- -m "название_миграции"
  ```
  Или через Makefile:
  ```bash
  make makemigrate MSG="название_миграции"
  ```
  Применить миграции локально:
  ```bash
  make migrate
  ```
