param(
    [string[]]$Apps
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path (Join-Path $PSScriptRoot '..') '..')).Path
$uiRoot = Join-Path $repoRoot 'packages\ui'
$webRoot = Join-Path $repoRoot 'apps\web'

if (-not $Apps -or $Apps.Count -eq 0) {
    $Apps = Get-ChildItem -LiteralPath $webRoot -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } |
        Select-Object -ExpandProperty Name
}

Push-Location $uiRoot
try {
    if (-not (Test-Path (Join-Path $uiRoot 'node_modules'))) {
        npm ci | Out-Host
    }

    npm run build | Out-Host
    $packResult = npm pack --json | ConvertFrom-Json
    $packageFileName = $packResult[0].filename
    $packageArchivePath = Join-Path $uiRoot $packageFileName

    foreach ($app in $Apps) {
        $appRoot = Join-Path $webRoot $app
        if (-not (Test-Path (Join-Path $appRoot 'package.json'))) {
            throw "Unknown web app '$app'"
        }

        $vendorDir = Join-Path $appRoot 'vendor'
        New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null
        Copy-Item -LiteralPath $packageArchivePath -Destination (Join-Path $vendorDir $packageFileName) -Force
    }

    Remove-Item -LiteralPath $packageArchivePath -Force
}
finally {
    Pop-Location
}