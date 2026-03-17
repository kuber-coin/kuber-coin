# Quick Start - KuberCoin Stack

Write-Host "🚀 Starting KuberCoin Stack..." -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Prefer `docker compose` (v2), fall back to `docker-compose` (v1)
$composeExe = "docker"
$composeArgs = @("compose")
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $composeExe = "docker-compose"
    $composeArgs = @()
}

# Build and start services
Write-Host "📦 Building containers..." -ForegroundColor Yellow
& $composeExe @composeArgs build

Write-Host ""
Write-Host "🔧 Starting services..." -ForegroundColor Yellow
& $composeExe @composeArgs up -d

Write-Host ""
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check service health
Write-Host ""
Write-Host "🏥 Checking service health..." -ForegroundColor Yellow

$services = @(
    @{Name="Node API"; Port=8634; Path="/api/health"},
    @{Name="Explorer"; Port=3200; Path="/"},
    @{Name="Wallet"; Port=3250; Path="/"},
    @{Name="Operations"; Port=3300; Path="/"},
    @{Name="Landing"; Port=3100; Path="/"}
)

foreach ($service in $services) {
    try {
        Invoke-WebRequest -Uri "http://localhost:$($service.Port)$($service.Path)" -UseBasicParsing -TimeoutSec 2 | Out-Null
        Write-Host "  ✓ $($service.Name) ($($service.Port)) is healthy" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠ $($service.Name) ($($service.Port)) is not responding" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "✅ KuberCoin is running!" -ForegroundColor Green
Write-Host ""
Write-Host "📱 Access the UIs:" -ForegroundColor Cyan
Write-Host "  • Explorer:    http://localhost:3200" -ForegroundColor White
Write-Host "  • Wallet:      http://localhost:3250" -ForegroundColor White
Write-Host "  • Operations:  http://localhost:3300" -ForegroundColor White
Write-Host "  • Landing:     http://localhost:3100" -ForegroundColor White
Write-Host "  • Grafana:     http://localhost:3000 (credentials from env/compose)" -ForegroundColor White
Write-Host ""
Write-Host "🔌 API Endpoints:" -ForegroundColor Cyan
Write-Host "  • Node API:    http://localhost:8634" -ForegroundColor White
Write-Host "  • Health:      http://localhost:8634/api/health" -ForegroundColor White
Write-Host "  • Metrics:     http://localhost:8634/metrics" -ForegroundColor White
Write-Host ""
Write-Host "📊 View logs:" -ForegroundColor Cyan
Write-Host "  $composeExe $($composeArgs -join ' ') logs -f node" -ForegroundColor Gray
Write-Host ""
Write-Host "🛑 Stop services:" -ForegroundColor Cyan
Write-Host "  $composeExe $($composeArgs -join ' ') down" -ForegroundColor Gray
