#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
ENV_FILE="${PROJECT_ROOT}/.env.dev"

if [ -f "${ENV_FILE}" ]; then
  set -a
  source <(grep -E '^[A-Z_][A-Z0-9_]*=' "${ENV_FILE}" | grep -v '^#' | sed 's/\r$//')
  set +a
fi

PG_CONTAINER="${PG_CONTAINER_NAME:-hrms-postgres}"
PG_USER="${POSTGRES_USER:-hrms_user}"
PG_DB="${POSTGRES_DB:-hrms_dev}"
TIMEOUT="${DB_WAIT_TIMEOUT:-60}"

"${SCRIPT_DIR}/wait-for-postgres.sh" "${PG_CONTAINER}" "${PG_USER}" "${PG_DB}" "${TIMEOUT}"

cd "${PROJECT_ROOT}/backend"

if command -v python >/dev/null 2>&1; then
  python scripts/migrate_production_version.py
elif command -v py.exe >/dev/null 2>&1; then
  py.exe scripts/migrate_production_version.py
fi

if command -v py.exe >/dev/null 2>&1; then
  exec py.exe -m alembic upgrade head
fi

if command -v alembic >/dev/null 2>&1; then
  exec alembic upgrade head
fi

if command -v python >/dev/null 2>&1; then
  exec python -m alembic upgrade head
fi

echo "Could not find alembic runner (py.exe, alembic, or python)." >&2
exit 1
