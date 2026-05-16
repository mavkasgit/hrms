$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.dev"

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
        $parts = $_.Split('=', 2)
        if ($parts.Count -eq 2) {
            [System.Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
        }
    }
}

$container = if ($env:PG_CONTAINER_NAME) { $env:PG_CONTAINER_NAME } else { "hrms-postgres" }
$pgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "hrms_user" }
$pgDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "hrms_dev" }
$timeoutSec = if ($env:DB_WAIT_TIMEOUT) { [int]$env:DB_WAIT_TIMEOUT } else { 60 }

& (Join-Path $PSScriptRoot "wait-for-postgres.ps1") -ContainerName $container -PgUser $pgUser -PgDatabase $pgDb -TimeoutSec $timeoutSec
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location (Join-Path $projectRoot "backend")
python -m alembic upgrade head
