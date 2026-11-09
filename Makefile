.PHONY: dev db-up db-down db-logs db-restart db-clean backend-install backend-run frontend-install frontend-run migrate makemigrate install-all test-env-up test-env-down test-env-logs test-env-rebuild

# Toolchain/versions live in mise.toml. Install, dev and run targets delegate
# to mise; DB/test-env targets stay raw docker compose because compose owns
# those services, and migrate targets stay raw alembic (run them inside
# `mise exec` or an activated shell when you need the pinned interpreter).

# One-command dev: DB + Backend + Frontend (run `mise run install` first)
dev:
	mise run dev

# Database (Docker)
db-up:
	docker compose --env-file .env.dev -f infra/compose/docker-compose.dev.yml up -d

db-down:
	docker compose --env-file .env.dev -f infra/compose/docker-compose.dev.yml down

db-logs:
	docker compose --env-file .env.dev -f infra/compose/docker-compose.dev.yml logs -f

db-restart: db-down db-up

db-clean: db-down
	docker compose --env-file .env.dev -f infra/compose/docker-compose.dev.yml down -v
	rm -rf data/

# Backend
backend-install:
	mise run install

backend-run:
	mise exec -- npm run dev:backend

# Frontend
frontend-install:
	mise run install

frontend-run:
	mise exec -- npm run frontend

# Database migrations
migrate:
	cd backend && alembic upgrade head

makemigrate:
	cd backend && alembic revision --autogenerate -m "$(MSG)"

# Install all deps
install-all:
	mise run install

# Test environment
test-env-up:
	@echo "Starting test environment with dev database dump..."
	@mkdir -p data/db_init
	@docker compose --env-file .env.dev -f infra/compose/docker-compose.dev.yml up -d
	@echo "Waiting for dev database..."
	@docker exec hrms-postgres pg_isready -U hrms_user -d hrms_dev || (sleep 5 && docker exec hrms-postgres pg_isready -U hrms_user -d hrms_dev)
	@docker exec hrms-postgres pg_dump -U hrms_user -d hrms_dev --clean --if-exists > data/db_init/01_init.sql
	@echo "Starting test environment..."
	@docker compose --env-file .env.test -f infra/compose/docker-compose.test.yml up -d --build
	@echo "Test environment ready at:"
	@echo "  - Frontend/API via nginx: http://localhost:8080"
	@echo "  - Backend API via nginx:  http://localhost:8080/api"

test-env-down:
	docker compose --env-file .env.test -f infra/compose/docker-compose.test.yml down

test-env-logs:
	docker compose --env-file .env.test -f infra/compose/docker-compose.test.yml logs -f

test-env-rebuild: test-env-down test-env-up
