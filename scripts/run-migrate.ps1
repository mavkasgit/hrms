$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.dev"

if (Test-Path $envFile) {
    $envDict = [ordered]@{}
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^\s*#' -or $line -notmatch '=') { return }
        $parts = $line.Split('=', 2)
        if ($parts.Count -eq 2) {
            $envDict[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
    foreach ($key in $envDict.Keys) {
        $val = $envDict[$key]
        $val = [regex]::Replace($val, '\$\{([A-Za-z0-9_]+)\}', { param($m)
            $varName = $m.Groups[1].Value
            if ($envDict.Contains($varName)) { $envDict[$varName] }
            elseif ([System.Environment]::GetEnvironmentVariable($varName, "Process")) { [System.Environment]::GetEnvironmentVariable($varName, "Process") }
            else { $m.Value }
        })
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

$container = if ($env:PG_CONTAINER_NAME) { $env:PG_CONTAINER_NAME } else { "hrms-postgres" }
$pgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "hrms_user" }
$pgDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "hrms_dev" }
$timeoutSec = if ($env:DB_WAIT_TIMEOUT) { [int]$env:DB_WAIT_TIMEOUT } else { 60 }

& (Join-Path $PSScriptRoot "wait-for-postgres.ps1") -ContainerName $container -PgUser $pgUser -PgDatabase $pgDb -TimeoutSec $timeoutSec
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location (Join-Path $projectRoot "backend")
python scripts/migrate_production_version.py
python -m alembic upgrade head
