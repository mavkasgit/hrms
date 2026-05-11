#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${1:-hrms-postgres}"
PG_USER="${2:-hrms_user}"
TIMEOUT="${3:-60}"
ELAPSED=0
INTERVAL=2

echo "Waiting for PostgreSQL in '${CONTAINER}' as '${PG_USER}' (timeout: ${TIMEOUT}s)..."

until docker exec "${CONTAINER}" pg_isready -U "${PG_USER}" -q 2>/dev/null; do
  if [ "${ELAPSED}" -ge "${TIMEOUT}" ]; then
    echo "PostgreSQL is not ready after ${TIMEOUT}s"
    exit 1
  fi
  sleep "${INTERVAL}"
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "PostgreSQL is ready"
