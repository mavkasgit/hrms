.PHONY: dev db-up db-down db-logs db-restart db-clean backend-install backend-run frontend-install frontend-run migrate makemigrate install-all

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
