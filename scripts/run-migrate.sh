#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
ENV_FILE="${PROJECT_ROOT}/.env.dev"

if [ -f "${ENV_FILE}" ]; then
  set -a
  source <(grep -E '^[A-Z_][A-Z0-9_]*=' "${ENV_FILE}" | grep -v '^#')
  set +a
fi

PG_CONTAINER="${PG_CONTAINER_NAME:-hrms-postgres}"
PG_USER="${POSTGRES_USER:-hrms_user}"
TIMEOUT="${DB_WAIT_TIMEOUT:-60}"

"${SCRIPT_DIR}/wait-for-postgres.sh" "${PG_CONTAINER}" "${PG_USER}" "${TIMEOUT}"

cd "${PROJECT_ROOT}/backend"
exec alembic upgrade head
