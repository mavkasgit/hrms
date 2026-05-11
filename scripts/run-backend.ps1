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

if ($env:ONLYOFFICE_INTERNAL_URL -like "*onlyoffice*") {
    $port = if ($env:DEV_ONLYOFFICE_PORT) { $env:DEV_ONLYOFFICE_PORT } else { "8085" }
    $env:ONLYOFFICE_INTERNAL_URL = "http://localhost:$port"
}

$backendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8000" }
Set-Location (Join-Path $projectRoot "backend")
uvicorn app.main:app --host 0.0.0.0 --port $backendPort --reload --reload-dir app
