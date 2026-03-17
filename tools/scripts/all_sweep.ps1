[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseApprovedVerbs', '', Justification='Internal script helper naming')]
param(
  [string]$ApiKey = "public_test_key_not_a_secret",
  [int]$TimeoutSec = 20,
  [switch]$SkipBuild,
  [switch]$SkipWalletWebE2E
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common_build.ps1"

$RepoRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)

function Write-Section([string]$title) {
  Write-Host "`n=== $title ===" -ForegroundColor Cyan
}

$WriteDockerDiagnostics = {
  try {
    Write-Host "`n--- Docker diagnostics ---" -ForegroundColor Yellow
    try {
      $ps = (docker compose ps 2>$null | Out-String)
      if (-not [string]::IsNullOrWhiteSpace($ps)) {
        Write-Host "docker compose ps:" -ForegroundColor Yellow
        Write-Host $ps
      }
    } catch {
      # ignore
    }

    foreach ($svc in @('node','prometheus','grafana','wallet-web','ops-web')) {
      try {
        Write-Host ("docker compose logs --tail=120 {0}:" -f $svc) -ForegroundColor Yellow
        docker compose logs --tail=120 $svc 2>$null | Out-Host
      } catch {
        # ignore
      }
    }
  } catch {
    # best-effort only
  }
}

function Invoke-Step([string]$name, [scriptblock]$step) {
  Write-Section $name
  try {
    $global:LASTEXITCODE = 0
    & $step
    if (-not $?) {
      throw "Step failed: $name"
    }
    if ($global:LASTEXITCODE -ne 0) {
      throw ("Step failed: {0} (exit {1})" -f $name, $global:LASTEXITCODE)
    }
    Write-Host "OK: $name" -ForegroundColor Green
  } catch {
    & $WriteDockerDiagnostics
    throw
  }
}

function Wait-Until(
  [scriptblock]$Condition,
  [int]$TimeoutSeconds,
  [int]$PollMilliseconds = 500
) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      if (& $Condition) { return $true }
    } catch {
      # ignore transient failures during polling
    }
    Start-Sleep -Milliseconds $PollMilliseconds
  }
  return $false
}

# Ensure consistent auth + test mode across scripts
$env:KUBERCOIN_API_KEYS = $ApiKey
$env:KUBERCOIN_API_KEY = $ApiKey
$env:KUBERCOIN_TEST_MODE = "1"

# Wallet-web e2e should point at the local node we start in scripts (HTTP 18080)
$env:KUBERCOIN_WALLET_API_URL = "http://127.0.0.1:18080"
$env:KUBERCOIN_WALLET_API_KEY = $ApiKey

# 1) Stop docker compose to avoid RPC port 8332 collisions with local node tests.
Invoke-Step "Docker compose down (avoid RPC port conflicts)" {
  try {
    docker compose down | Out-Null
    $global:LASTEXITCODE = 0
  } catch {
    # if docker isn't installed/running, or compose isn't up, keep going
    Write-Host "WARN: docker compose down failed/skipped: $($_.Exception.Message)" -ForegroundColor Yellow
    $global:LASTEXITCODE = 0
  }
}

# 2) Local build + CLI + local-node E2E
if (-not $SkipBuild) {
  Invoke-Step "Build node (release)" {
    Invoke-NodeReleaseBuild -WorkspaceRoot $RepoRoot -StopRunningNode
  }
} else {
  Write-Section "Build node (release)"
  Write-Host "SKIP: Build node (release)" -ForegroundColor Yellow
}

Invoke-Step "CLI JSON smoke" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "cli_json_smoke.ps1")
}

Invoke-Step "E2E smoke (local node)" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "e2e_smoke.ps1") -ApiKey $ApiKey
}

Invoke-Step "E2E extended (local node)" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "e2e_extended.ps1") -ApiKey $ApiKey
}

Invoke-Step "Test complete (local node suite)" {
  powershell -NoProfile -ExecutionPolicy Bypass -File test-complete.ps1
}

if (-not $SkipWalletWebE2E) {
  Invoke-Step "Wallet-web Playwright E2E" {
    Push-Location (Join-Path $RepoRoot "apps\web\wallet")
    try {
      npm run test:e2e
    } finally {
      Pop-Location
    }
  }
} else {
  Write-Section "Wallet-web Playwright E2E"
  Write-Host "SKIP: Wallet-web Playwright E2E" -ForegroundColor Yellow
}

# 3) Compose + strict live monitoring (full stack)
Invoke-Step "Docker compose up (full stack)" {
  docker compose up -d
  if ($global:LASTEXITCODE -ne 0) {
    Write-Host "WARN: docker compose up failed; retrying with --build" -ForegroundColor Yellow
    docker compose up -d --build
  }
}

Invoke-Step "Wait for docker stack ready" {
  $script:lastHealth = $null
  $okNode = Wait-Until -TimeoutSeconds ([Math]::Max(90, $TimeoutSec * 6)) -Condition {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:8634/api/health" -UseBasicParsing -TimeoutSec 5
      $script:lastHealth = "HTTP {0}" -f $r.StatusCode
      return ($r.StatusCode -eq 200)
    } catch {
      $code = $null
      try { $code = $_.Exception.Response.StatusCode.value__ } catch {}
      if ($code) { $script:lastHealth = "HTTP {0}" -f $code }
      else { $script:lastHealth = $_.Exception.Message }
      return $false
    }
  }
  if (-not $okNode) {
    throw ("Node /api/health did not become ready in time (last={0})" -f $script:lastHealth)
  }

  $script:lastProm = $null
  $okProm = Wait-Until -TimeoutSeconds ([Math]::Max(90, $TimeoutSec * 6)) -Condition {
    try {
      $b = Invoke-RestMethod -Method Get -Uri "http://localhost:9092/api/v1/status/buildinfo" -TimeoutSec 5
      $script:lastProm = $b.status
      return ($b.status -eq "success")
    } catch {
      $script:lastProm = $_.Exception.Message
      return $false
    }
  }
  if (-not $okProm) {
    throw ("Prometheus API did not become ready in time (last={0})" -f $script:lastProm)
  }
}

Invoke-Step "E2E live strict (docker stack)" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "e2e_live.ps1") -StrictMonitoring -TimeoutSec $TimeoutSec -ApiKey $ApiKey
}

Write-Host "`nALL SWEEP PASSED" -ForegroundColor Green
