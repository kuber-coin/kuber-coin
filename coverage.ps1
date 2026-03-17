#!/usr/bin/env pwsh
# KuberCoin Code Coverage Script
# Generates HTML coverage report using cargo-llvm-cov

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  KuberCoin Code Coverage Analysis" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if cargo-llvm-cov is installed
$llvmCovInstalled = Get-Command cargo-llvm-cov -ErrorAction SilentlyContinue
if (-not $llvmCovInstalled) {
    Write-Host "❌ cargo-llvm-cov not found. Installing..." -ForegroundColor Yellow
    cargo install cargo-llvm-cov
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install cargo-llvm-cov" -ForegroundColor Red
        exit 1
    }
}

Write-Host "🔍 Running code coverage analysis..." -ForegroundColor Green
Write-Host ""

# Clean previous coverage data
Write-Host "Cleaning previous coverage data..." -ForegroundColor Yellow
cargo llvm-cov clean --workspace

# Run tests with coverage
Write-Host "Running tests with coverage tracking..." -ForegroundColor Yellow
cargo llvm-cov --all-features --workspace --html

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  ✅ Coverage Report Generated Successfully!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Open coverage report at: target/llvm-cov/html/index.html" -ForegroundColor Cyan
    Write-Host ""
    
    # Try to open the report in browser
    $reportPath = "target\llvm-cov\html\index.html"
    if (Test-Path $reportPath) {
        Write-Host "Opening coverage report in browser..." -ForegroundColor Cyan
        Start-Process $reportPath
    }
} else {
    Write-Host ""
    Write-Host "❌ Coverage generation failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Coverage Commands:" -ForegroundColor Yellow
Write-Host "  - Generate HTML:    cargo llvm-cov --all-features --workspace --html" -ForegroundColor Gray
Write-Host "  - Generate JSON:    cargo llvm-cov --all-features --workspace --json --output-path coverage.json" -ForegroundColor Gray
Write-Host "  - Terminal summary: cargo llvm-cov --all-features --workspace" -ForegroundColor Gray
Write-Host "  - Clean data:       cargo llvm-cov clean --workspace" -ForegroundColor Gray
Write-Host ""
