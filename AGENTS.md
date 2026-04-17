# AGENTS.md

This file defines the working rules for AI agents in this repository.

## Project Context

- Stack: FastAPI backend, React/Vite frontend, PostgreSQL, Docker Compose.
- Primary command source of truth: `package.json` in the repository root.
- Prefer `npm` scripts from `package.json` over ad-hoc shell commands and over `Makefile` aliases.

## Working Directory

- Run root orchestration commands from `D:\VibeCoding\hrms`.
- Run backend-only commands from `D:\VibeCoding\hrms\backend` only when the root `npm` script does not already exist.
- Run frontend-only commands from `D:\VibeCoding\hrms\frontend` only when the root `npm` script does not already exist.

## Dev Server Rules

- Before starting the full app, prefer `npm run dev`.
- `npm run dev` automatically runs `predev`, which starts the dev database via `npm run db:up`.
- `npm run dev` starts:
  - Docker database logs follower
  - FastAPI backend on port `8000`
  - Vite frontend on port `5173`
- Treat `npm run dev` as a long-running foreground process. Run it only when an active dev session is needed.

## Stop And Restart Rules

- To stop backend/frontend dev ports, use `npm run devkill`.
- To restart the local app stack, use `npm run devrestart`.
- `npm run devkill` does not stop Docker containers. It only kills the app ports used by backend/frontend.
- To stop the dev database container, use `npm run db:down`.
- For a full local shutdown, prefer:
  - `npm run devkill`
  - `npm run db:down`

## Database Rules

- Start dev database: `npm run db:up`
- Stop dev database: `npm run db:down`
- Follow dev database logs: `npm run db:logs`
- Apply migrations: `npm run db:migrate`
- Create a migration: `npm run db:makemigrate -- "message"`

## Test Environment Rules

- Start test environment: `npm run test:up`
- Stop test environment: `npm run test:down`
- Follow test logs: `npm run test:logs`

## Agent Execution Preferences

- Prefer the smallest command that solves the task:
  - schema or migration work: use `npm run db:up` and `npm run db:migrate`
  - frontend-only work: use `npm run frontend`
  - backend-only work: use `npm run backend`
  - full-stack verification: use `npm run dev`
- Before launching a new long-running process, check whether one is already active.
- Do not start duplicate frontend/backend/dev servers on the same ports.
- After finishing a task that required local servers, stop only the processes started for that task unless the user asked to leave them running.

## Notes About Current Scripts

- `npm run backend` runs `uvicorn app.main:app --host 0.0.0.0 --port 8000` without `--reload`.
- `npm run frontend` delegates to `frontend` package scripts.
- `npm run dev` includes `db:logs`, so the command intentionally streams Docker logs and remains attached.
- `package.json` is newer and more authoritative for agent workflows than `Makefile` aliases when they differ.
