.PHONY: dev db-up db-down db-logs db-restart db-clean backend-install backend-run frontend-install frontend-run migrate makemigrate install-all test-env-up test-env-down test-env-logs test-env-rebuild

# One-command dev: DB + Backend + Frontend
dev:
	npm install && npm run dev

# Database (Docker)
db-up:
	docker compose -f infra/docker-compose.dev.yml up -d

db-down:
	docker compose -f infra/docker-compose.dev.yml down

db-logs:
	docker compose -f infra/docker-compose.dev.yml logs -f

db-restart: db-down db-up

db-clean: db-down
	docker compose -f infra/docker-compose.dev.yml down -v
	rm -rf data/

# Backend
backend-install:
	cd backend && pip install -r requirements.txt

backend-run:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
frontend-install:
	cd frontend && npm install

frontend-run:
	cd frontend && npm run dev

# Database migrations
migrate:
	cd backend && alembic upgrade head

makemigrate:
	cd backend && alembic revision --autogenerate -m "$(MSG)"

# Install all deps
install-all: backend-install frontend-install
	npm install

# Test environment
test-env-up:
	@echo "Starting test environment with dev database dump..."
	@if not exist "data\db_init" mkdir "data\db_init"
	@docker compose -f infra/docker-compose.dev.yml up -d
	@echo "Waiting for dev database..."
	@docker exec hrms-postgres pg_isready -U hrms_user -d hrms_dev || (timeout /t 5 && docker exec hrms-postgres pg_isready -U hrms_user -d hrms_dev)
	@docker exec hrms-postgres pg_dump -U hrms_user -d hrms_dev --clean --if-exists > data\db_init\01_init.sql
	@echo "Starting test environment..."
	@docker compose -f infra/docker-compose.test.yml up -d --build
	@echo "Test environment ready at:"
	@echo "  - Frontend: http://localhost:5173"
	@echo "  - Backend:  http://localhost:8001"
	@echo "  - DB:       localhost:5433"

test-env-down:
	docker compose -f infra/docker-compose.test.yml down

test-env-logs:
	docker compose -f infra/docker-compose.test.yml logs -f

test-env-rebuild: test-env-down test-env-up
