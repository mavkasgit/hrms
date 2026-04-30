param(
    [Parameter(Mandatory = $true)]
    [string]$ContainerName,

    [int]$TimeoutSeconds = 60
)

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
    $status = docker inspect -f '{{.State.Health.Status}}' $ContainerName 2>$null

    if ($LASTEXITCODE -eq 0 -and $status -eq 'healthy') {
        Write-Host "$ContainerName is healthy"
        exit 0
    }

    Start-Sleep -Seconds 1
}

Write-Error "$ContainerName did not become healthy within $TimeoutSeconds seconds"
exit 1
