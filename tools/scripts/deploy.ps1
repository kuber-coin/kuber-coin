# PowerShell Deployment Script for KuberCoin
# Usage: .\deploy.ps1 -Provider [aws|gcp|azure|local] -Environment [production|staging] -Region [region]
# Example: .\deploy.ps1 -Provider aws -Environment production -Region us-east-1

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("aws", "gcp", "azure", "local")]
    [string]$Provider,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("production", "staging", "development")]
    [string]$Environment = "staging",
    
    [Parameter(Mandatory=$false)]
    [string]$Region = ""
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "KuberCoin Deployment Script" -ForegroundColor Cyan
Write-Host "Provider: $Provider" -ForegroundColor Yellow
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." "..")).Path

function Convert-ToWslPath {
    param([Parameter(Mandatory=$true)][string]$WindowsPath)

    $normalized = $WindowsPath -replace '\\', '/'
    if ($normalized -match '^([A-Za-z]):/(.*)$') {
        return "/mnt/$($Matches[1].ToLower())/$($Matches[2])"
    }

    throw "Unable to convert Windows path to WSL path: $WindowsPath"
}

# Check if running on Windows with WSL
function Test-WSL {
    return $null -ne (Get-Command wsl -ErrorAction SilentlyContinue)
}

# Deploy using cloud provider
function Deploy-Cloud {
    param($Provider, $Environment, $Region)
    
    if (-not (Test-WSL)) {
        Write-Host "Error: WSL is required to run deployment scripts on Windows" -ForegroundColor Red
        Write-Host "Install WSL with: wsl --install" -ForegroundColor Yellow
        exit 1
    }
    
    $scriptPath = switch ($Provider) {
        "aws" { Convert-ToWslPath (Join-Path $RepoRoot "tools\scripts\deploy-aws.sh") }
        "gcp" { Convert-ToWslPath (Join-Path $RepoRoot "tools\scripts\deploy-gcp.sh") }
        "azure" { Convert-ToWslPath (Join-Path $RepoRoot "tools\scripts\deploy-azure.sh") }
    }
    
    # Make script executable
    wsl chmod +x $scriptPath
    
    # Run deployment script
    if ($Region) {
        wsl bash $scriptPath $Environment $Region
    } else {
        wsl bash $scriptPath $Environment
    }
}

# Deploy locally with Docker Compose
function Deploy-Local {
    Write-Host "Deploying locally with Docker Compose..." -ForegroundColor Green
    
    # Check Docker
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "Error: Docker not installed" -ForegroundColor Red
        exit 1
    }
    
    # Build images
    Write-Host "Building Docker images..." -ForegroundColor Yellow
    docker-compose build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Docker build failed" -ForegroundColor Red
        exit 1
    }
    
    # Start services
    Write-Host "Starting services..." -ForegroundColor Yellow
    docker-compose up -d
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to start services" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "Local Deployment Complete!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "Node API: http://localhost:8634" -ForegroundColor Yellow
    Write-Host "P2P: localhost:8633" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "View logs: docker-compose logs -f" -ForegroundColor Gray
    Write-Host "Stop: docker-compose down" -ForegroundColor Gray
    Write-Host "==========================================" -ForegroundColor Cyan
}

# Main execution
switch ($Provider) {
    "local" {
        Deploy-Local
    }
    default {
        Deploy-Cloud -Provider $Provider -Environment $Environment -Region $Region
    }
}
