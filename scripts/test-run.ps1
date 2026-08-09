$ErrorActionPreference = "Stop"

# ============================================================
# Test runner with per-run isolated PostgreSQL database (HRMS).
#
#   npm run test:pytest                parallel (-n auto --dist=loadfile)
#   npm run test:pytest:full           serial
#   npm run test:pytest:lf             parallel + last-failed
#   npm run test:pytest -- -k <expr>   extra pytest args pass through
#
# Every invocation gets its own TEST_RUN_ID / TEST_DB_NAME /
# TEST_DATABASE_URL. Multiple agents may run this concurrently:
# each run creates, uses and drops ONLY its own database.
# ============================================================

# ------------------------------------------------------------
# Configuration
# ------------------------------------------------------------
$PostgresHost = if ($env:TEST_DB_HOST)     { $env:TEST_DB_HOST }     else { "localhost" }
$PostgresPort = if ($env:TEST_DB_PORT)     { $env:TEST_DB_PORT }     else { "5436" }
$PostgresUser = if ($env:TEST_DB_USER)     { $env:TEST_DB_USER }     else { "hrms_user" }
$PostgresPassword = if ($env:TEST_DB_PASSWORD) { $env:TEST_DB_PASSWORD } else { "hrms_pass" }
$PostgresContainer = if ($env:TEST_DB_CONTAINER) { $env:TEST_DB_CONTAINER } else { "hrms-postgres-pytest" }
# xdist worker cap for the parallel run. Default: -n auto (= all cores).
# When several agents run tests concurrently, set PYTEST_NUM_WORKERS (e.g. 4),
# otherwise every run grabs all cores and the machine becomes unresponsive.
$NumWorkers = $env:PYTEST_NUM_WORKERS

# ------------------------------------------------------------
# Unique run identity
# ------------------------------------------------------------
$TestRunId = [guid]::NewGuid().ToString("N").ToLower().Substring(0, 12)
$TestDbName = "hrms_test_$TestRunId"
$TestDatabaseUrl = "postgresql+asyncpg://$PostgresUser`:$PostgresPassword@$PostgresHost`:$PostgresPort/$TestDbName"

$env:TEST_RUN_ID = $TestRunId
$env:TEST_DB_NAME = $TestDbName
$env:TEST_DATABASE_URL = $TestDatabaseUrl
# HRMS-совместимый alias (conftest читает оба имени).
$env:HRMS_TEST_DATABASE_URL = $TestDatabaseUrl

Write-Host ""
Write-Host "============================================================"
Write-Host " TEST RUN"
Write-Host "============================================================"
Write-Host " Run ID : $TestRunId"
Write-Host " DB     : $TestDbName"
Write-Host "============================================================"
Write-Host ""

# ------------------------------------------------------------
# Mode flags
# ------------------------------------------------------------
$FullRun = $args -contains "--full"
$Lf = $args -contains "--lf"
$PytestArgs = @($args | Where-Object { $_ -notin @("--full", "--lf") })
if ($Lf) { $PytestArgs += "--lf" }

if ($FullRun) { Write-Host "Mode   : FULL / SERIAL" }
else {
    if ($NumWorkers) { Write-Host "Mode   : FAST / XDIST (workers=$NumWorkers)" }
    else             { Write-Host "Mode   : FAST / XDIST (auto)" }
}
Write-Host ""

# ------------------------------------------------------------
# Lifecycle
# ------------------------------------------------------------
$ExitCode = 1
$DatabaseCreated = $false

try {
    # PostgreSQL is shared infrastructure. Only run up/wait when the container
    # is not healthy yet: under concurrent agents redundant docker compose calls
    # block on the compose lock and make the start look hung.
    $health = docker inspect -f '{{.State.Health.Status}}' $PostgresContainer 2>$null
    if ($LASTEXITCODE -eq 0 -and $health -eq 'healthy') {
        Write-Host "[1/6] PostgreSQL already healthy - skipping up/wait"
    } else {
        Write-Host "[1/6] Starting PostgreSQL..."
        & npm.cmd run test:db:up
        if ($LASTEXITCODE -ne 0) { throw "test:db:up failed (exit $LASTEXITCODE)" }

        Write-Host "[2/6] Waiting for PostgreSQL..."
        & npm.cmd run test:db:wait
        if ($LASTEXITCODE -ne 0) { throw "test:db:wait failed (exit $LASTEXITCODE)" }
    }

    Write-Host "[3/6] Creating isolated database..."
    & python scripts/test-db.py create $TestDbName
    if ($LASTEXITCODE -ne 0) { throw "Failed to create test database: $TestDbName" }
    $DatabaseCreated = $true

    Write-Host "[4/6] Verifying database..."
    & python scripts/test-db.py verify $TestDbName
    if ($LASTEXITCODE -ne 0) { throw "Database verify failed for $TestDbName" }

    Push-Location backend
    try {
        Write-Host ""
        Write-Host "[5/6] Running pytest..."
        Write-Host "TEST_DATABASE_URL=$TestDatabaseUrl"
        Write-Host ""
        if ($FullRun) {
            $PytestOutput = & python -m pytest -q @PytestArgs 2>&1
        } else {
            if ($NumWorkers) {
                $PytestOutput = & python -m pytest -n $NumWorkers --dist=loadfile -q @PytestArgs 2>&1
            } else {
                $PytestOutput = & python -m pytest -n auto --dist=loadfile -q @PytestArgs 2>&1
            }
        }
        $ExitCode = $LASTEXITCODE
        # pytest-xdist may report a worker crash as a successful (0) exit when the
        # suite never actually ran. Detect that and force failure.
        if ($ExitCode -eq 0 -and ($PytestOutput -match 'node down|maximum crashed workers')) {
            Write-Warning "pytest-xdist workers crashed; forcing failure"
            $ExitCode = 2
        }
        $PytestOutput | ForEach-Object { Write-Host $_ }
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Host ""
    Write-Error $_
    $ExitCode = 1
}
finally {
    if ($DatabaseCreated) {
        Write-Host ""
        Write-Host "[6/6] Cleaning up database: $TestDbName"
        & python scripts/test-db.py drop $TestDbName
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Failed to cleanup test database: $TestDbName"
        }
    }
}

Write-Host ""
if ($ExitCode -eq 0) {
    Write-Host "============================================================"
    Write-Host " TESTS PASSED"
    Write-Host "============================================================"
}
else {
    Write-Host "============================================================"
    Write-Host " TESTS FAILED"
    Write-Host " Exit code: $ExitCode"
    Write-Host "============================================================"
}

exit $ExitCode
