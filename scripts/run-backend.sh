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

if [[ "${ONLYOFFICE_INTERNAL_URL:-}" == *"onlyoffice"* ]]; then
  export ONLYOFFICE_INTERNAL_URL="http://localhost:${DEV_ONLYOFFICE_PORT:-8085}"
fi

cd "${PROJECT_ROOT}/backend"
exec uvicorn app.main:app --host 0.0.0.0 --port "${BACKEND_PORT:-8000}"


