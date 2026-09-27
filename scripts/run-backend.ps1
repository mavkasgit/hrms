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

if ($env:ONLYOFFICE_INTERNAL_URL -like "*onlyoffice*") {
    $port = if ($env:DEV_ONLYOFFICE_PORT) { $env:DEV_ONLYOFFICE_PORT } else { "8085" }
    $env:ONLYOFFICE_INTERNAL_URL = "http://localhost:$port"
}

$backendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8011" }
$env:BACKEND_PORT = $backendPort
Set-Location (Join-Path $projectRoot "backend")
$pythonPath = if (Test-Path ".\.venv\Scripts\python.exe") { ".\.venv\Scripts\python.exe" } else { "python" }
& $pythonPath scripts/dev_server.py


