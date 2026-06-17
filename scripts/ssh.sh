#!/bin/bash
# Load credentials from .env (NOT in git) and exec ssh-mcp on stdio.
# .env must live at the repo root and contain: SSH_HOST, SSH_PORT, SSH_USER, SSH_PASSWORD
set -a
scriptDir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "${scriptDir}/.." || exit 1

if [ ! -f "./.env" ]; then
    echo "Error: .env file not found at project root" >&2
    exit 1
fi

source "./.env"
set +a

if [ -z "$SSH_HOST" ] || [ -z "$SSH_USER" ] || [ -z "$SSH_PASSWORD" ]; then
    echo "Error: SSH credentials (SSH_HOST, SSH_USER, SSH_PASSWORD) are not fully defined in .env" >&2
    exit 1
fi

exec npx ssh-mcp -y \
        -- \
        --host="$SSH_HOST" \
        --port="${SSH_PORT:-22}" \
        --user="$SSH_USER" \
        --password="$SSH_PASSWORD" \
        --timeout=300000 \
        --maxChars=none
