#!/usr/bin/env pwsh
# Build script for Windows WinUI3 mining dashboard

param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [bool]$SelfContained = $true,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host "Building KuberCoin Miner for Windows..." -ForegroundColor Cyan

$ProjectDir = Join-Path $PSScriptRoot ".." ".." "apps" "native" "mining-ui" "windows-winui3"

if (-not (Test-Path $ProjectDir)) {
    Write-Error "Project directory not found: $ProjectDir"
    exit 1
}

Push-Location $ProjectDir

try {
    if ($Clean) {
        Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
        if (Test-Path "bin") { Remove-Item -Recurse -Force "bin" }
        if (Test-Path "obj") { Remove-Item -Recurse -Force "obj" }
        if (Test-Path "publish") { Remove-Item -Recurse -Force "publish" }
    }

    Write-Host "Restoring dependencies..." -ForegroundColor Yellow
    dotnet restore
    if ($LASTEXITCODE -ne 0) { throw "Restore failed" }

    Write-Host "Building project..." -ForegroundColor Yellow
    dotnet build --configuration $Configuration --no-restore
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }

    Write-Host "Publishing application..." -ForegroundColor Yellow
    $PublishArgs = @(
        "publish"
        "--configuration", $Configuration
        "--output", "./publish"
        "-r", $Runtime
    )
    
    if ($SelfContained) {
        $PublishArgs += "--self-contained", "true"
    }

    & dotnet @PublishArgs
    if ($LASTEXITCODE -ne 0) { throw "Publish failed" }

    Write-Host "`n✅ Build completed successfully!" -ForegroundColor Green
    Write-Host "Output location: $(Join-Path $ProjectDir 'publish')" -ForegroundColor Cyan
    
    $ExePath = Join-Path $ProjectDir "publish" "KuberCoinMiner.exe"
    if (Test-Path $ExePath) {
        $FileInfo = Get-Item $ExePath
        Write-Host "Binary size: $([math]::Round($FileInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
    }
}
catch {
    Write-Error "Build failed: $_"
    exit 1
}
finally {
    Pop-Location
}
