param(
    [string]$ContainerName = "hrms-postgres",
    [string]$PgUser = "hrms_user",
    [int]$TimeoutSec = 60,
    [int]$IntervalSec = 2
)

$startWaitSec = 30
$started = $false

for ($elapsed = 0; $elapsed -lt $startWaitSec; $elapsed += 2) {
    $state = docker inspect --format='{{.State.Status}}' $ContainerName 2>$null
    if ($LASTEXITCODE -eq 0 -and $state -eq "running") {
        $started = $true
        break
    }
    Start-Sleep -Seconds 2
}

if (-not $started) {
    Write-Error "Container '$ContainerName' did not start within ${startWaitSec}s"
    exit 1
}

for ($elapsed = 0; $elapsed -lt $TimeoutSec; $elapsed += $IntervalSec) {
    docker exec $ContainerName pg_isready -U $PgUser -q 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PostgreSQL is ready"
        exit 0
    }
    Start-Sleep -Seconds $IntervalSec
}

Write-Error "PostgreSQL is not ready after ${TimeoutSec}s"
exit 1
