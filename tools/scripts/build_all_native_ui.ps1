#!/usr/bin/env pwsh
# Master build script for all native mining UIs

param(
    [ValidateSet("all", "windows", "linux", "macos")]
    [string]$Platform = "all",

    [switch]$Clean = $false,
    [switch]$Package = $false
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "🚀 Building KuberCoin Native Mining UIs" -ForegroundColor Cyan
Write-Host "Platform: $Platform" -ForegroundColor Yellow
Write-Host ""

$BuildResults = @{}

function Build-Windows {
    Write-Host "=" * 80 -ForegroundColor Blue
    Write-Host "Building Windows (WinUI 3)" -ForegroundColor Blue
    Write-Host "=" * 80 -ForegroundColor Blue

    try {
        $Args = @()
        if ($Clean) { $Args += "-Clean" }

        & "$ScriptDir\build_native_ui_windows.ps1" @Args
        $BuildResults["Windows"] = "✅ Success"
    }
    catch {
        $BuildResults["Windows"] = "❌ Failed: $_"
        Write-Warning "Windows build failed"
    }

    Write-Host ""
}

function Build-Linux {
    Write-Host "=" * 80 -ForegroundColor Blue
    Write-Host "Building Linux (GTK4)" -ForegroundColor Blue
    Write-Host "=" * 80 -ForegroundColor Blue

    if ($IsWindows) {
        Write-Warning "Skipping Linux build (requires Linux or WSL)"
        $BuildResults["Linux"] = "⏭️ Skipped (wrong platform)"
        return
    }

    try {
        $Args = @("--release")
        if ($Clean) { $Args += "--clean" }

        bash "$ScriptDir/build_native_ui_linux.sh" @Args
        $BuildResults["Linux"] = "✅ Success"
    }
    catch {
        $BuildResults["Linux"] = "❌ Failed: $_"
        Write-Warning "Linux build failed"
    }

    Write-Host ""
}

function Build-macOS {
    Write-Host "=" * 80 -ForegroundColor Blue
    Write-Host "Building macOS (SwiftUI)" -ForegroundColor Blue
    Write-Host "=" * 80 -ForegroundColor Blue

    if (-not $IsMacOS) {
        Write-Warning "Skipping macOS build (requires macOS)"
        $BuildResults["macOS"] = "⏭️ Skipped (wrong platform)"
        return
    }

    try {
        $Args = @()
        if ($Clean) { $Args += "--clean" }
        if ($Package) { $Args += "--dmg" }

        bash "$ScriptDir/build_native_ui_macos.sh" @Args
        $BuildResults["macOS"] = "✅ Success"
    }
    catch {
        $BuildResults["macOS"] = "❌ Failed: $_"
        Write-Warning "macOS build failed"
    }

    Write-Host ""
}

# Execute builds based on platform selection
switch ($Platform) {
    "all" {
        Build-Windows
        Build-Linux
        Build-macOS
    }
    "windows" {
        Build-Windows
    }
    "linux" {
        Build-Linux
    }
    "macos" {
        Build-macOS
    }
}

# Summary
Write-Host "=" * 80 -ForegroundColor Green
Write-Host "Build Summary" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Green

foreach ($Platform in $BuildResults.Keys | Sort-Object) {
    Write-Host "$Platform : $($BuildResults[$Platform])"
}

Write-Host ""

$FailedBuilds = $BuildResults.Values | Where-Object { $_ -like "*Failed*" }
if ($FailedBuilds.Count -gt 0) {
    Write-Host "⚠️ Some builds failed" -ForegroundColor Red
    exit 1
}
else {
    Write-Host "✅ All builds completed successfully!" -ForegroundColor Green
    exit 0
}
