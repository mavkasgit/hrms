# Установка HRMS с нуля (Linux/macOS/Windows)

## 1. Требования

- Docker + Docker Compose v2
- Node.js 20+
- Python 3.11+ (для локального dev backend)

## 2. Подготовка

```bash
git clone https://github.com/mavkasgit/hrms.git
cd hrms
npm install
npm install --prefix frontend
pip install -r backend/requirements.txt
```

## 3. DEV (кроссплатформенно)

DEV использует Docker только для PostgreSQL и OnlyOffice. Backend/Frontend работают локально.

```bash
npm run docker:dev:up
npm run dev
```

Точки доступа:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- OnlyOffice: `http://localhost:8085`

## 4. TEST (Docker full stack)

```bash
npm run docker:test:up
```

С tunnel-профилем:

```bash
npm run test:tunnel:up
```

Точка доступа:
- Nginx entrypoint: `http://localhost:8080`

## 5. PROD (Docker full stack)

```bash
npm run docker:prod:up
```

С tunnel-профилем:

```bash
npm run prod:tunnel:up
```

Точка доступа:
- Nginx entrypoint: `http://localhost` (и `https://localhost`, если настроен TLS)

## 6. Остановка

```bash
npm run docker:dev:down
npm run docker:test:down
npm run docker:prod:down
```

## 7. Проверка состояния

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Ожидаемо:
- `hrms-*-test` и `hrms-*-prod` существуют одновременно без пересечения портов
- test слушает `8080`, prod слушает `80/443`

