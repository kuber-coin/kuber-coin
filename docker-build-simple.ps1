param(
    [string]$Tag = "kubercoin:latest"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Building Docker image '$Tag' using Dockerfile.simple from: $repoRoot" -ForegroundColor Cyan

$dockerfile = Join-Path $repoRoot "Dockerfile.simple"
if (-not (Test-Path $dockerfile)) {
    throw "Dockerfile not found: $dockerfile"
}

docker build -f $dockerfile -t $Tag $repoRoot
