param(
  [string]$ApiKey = "public_test_key_not_a_secret",
  [string]$ReportRoot = ""
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common_build.ps1"

$runStartedAt = Get-Date
$stepResults = @()

function Add-StepResult([string]$Name, [bool]$Passed, [double]$DurationSec, [string]$Details = "") {
  $script:stepResults += [pscustomobject]@{
    name = $Name
    passed = $Passed
    durationSec = [math]::Round($DurationSec, 2)
    details = $Details
  }
}

function Write-Section([string]$text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function Invoke-Step([string]$name, [scriptblock]$step) {
  Write-Section $name
  $stepStartedAt = Get-Date
  try {
    & $step
    if (-not $?) {
      throw "Step failed: $name"
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Step failed: $name (exit $LASTEXITCODE)"
    }
    Add-StepResult -Name $name -Passed $true -DurationSec ((Get-Date) - $stepStartedAt).TotalSeconds
  } catch {
    Add-StepResult -Name $name -Passed $false -DurationSec ((Get-Date) - $stepStartedAt).TotalSeconds -Details $_.Exception.Message
    throw
  }
}

function Save-PlaywrightAttemptArtifacts([int]$Attempt) {
  $walletWebRoot = Join-Path $workspaceRoot "apps\web\wallet"
  $attemptRoot = Join-Path $walletWebAttemptsRoot ("attempt-{0}" -f $Attempt)

  New-Item -ItemType Directory -Path $attemptRoot -Force | Out-Null

  $reportDir = Join-Path $walletWebRoot "playwright-report"
  $savedReportDir = Join-Path $attemptRoot "playwright-report"
  if (Test-Path $reportDir) {
    if (Test-Path $savedReportDir) {
      Remove-Item -LiteralPath $savedReportDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Copy-Item -LiteralPath $reportDir -Destination $savedReportDir -Recurse -Force
  }

  $resultsDir = Join-Path $walletWebRoot "test-results"
  $savedResultsDir = Join-Path $attemptRoot "test-results"
  if (Test-Path $resultsDir) {
    if (Test-Path $savedResultsDir) {
      Remove-Item -LiteralPath $savedResultsDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Copy-Item -LiteralPath $resultsDir -Destination $savedResultsDir -Recurse -Force
  }

  return $attemptRoot
}

function Invoke-WalletWebPlaywrightAttempt([int]$Attempt) {
  $walletWebRoot = Join-Path $workspaceRoot "apps\web\wallet"
  $attemptRoot = Join-Path $walletWebAttemptsRoot ("attempt-{0}" -f $Attempt)
  if (Test-Path $attemptRoot) {
    Remove-Item -LiteralPath $attemptRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Path $attemptRoot -Force | Out-Null

  Push-Location $walletWebRoot
  try {
    $attemptLog = Join-Path $attemptRoot "playwright-output.log"
    $attemptErrLog = Join-Path $attemptRoot "playwright-error.log"
    $playwrightCli = Join-Path $walletWebRoot "node_modules\playwright\cli.js"
    if (-not (Test-Path $playwrightCli)) {
      throw "Playwright CLI not found at $playwrightCli"
    }

    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $attemptCmd = ("{0} {1} test --workers=1 --reporter=line" -f $nodePath, $playwrightCli)
    "Command: $attemptCmd" | Set-Content -Path $attemptLog -Encoding UTF8
    Write-Host $attemptCmd -ForegroundColor DarkGray
    if (Test-Path $attemptErrLog) {
      Remove-Item -LiteralPath $attemptErrLog -Force -ErrorAction SilentlyContinue
    }

    $process = Start-Process -FilePath $nodePath `
      -ArgumentList $playwrightCli, "test", "--workers=1", "--reporter=line" `
      -WorkingDirectory $walletWebRoot `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $attemptLog `
      -RedirectStandardError $attemptErrLog
    $exitCode = $process.ExitCode

    if (Test-Path $attemptLog) {
      Get-Content -LiteralPath $attemptLog | Out-Host
    }
    if (Test-Path $attemptErrLog) {
      $stderrLines = Get-Content -LiteralPath $attemptErrLog
      if ($stderrLines.Count -gt 0) {
        $stderrLines | Out-Host
      }
    }

    $savedRoot = Save-PlaywrightAttemptArtifacts -Attempt $Attempt

    if ($exitCode -ne 0) {
      Write-Host ("Wallet-web attempt {0} artifacts saved to {1}" -f $Attempt, $savedRoot) -ForegroundColor Yellow
      throw "Wallet-web Playwright failed on attempt $Attempt (exit $exitCode)"
    }
  } finally {
    Pop-Location
  }
}

function Initialize-WalletWebRoutes() {
  $baseUrl = "http://127.0.0.1:3250"
  $routes = @(
    "/wallet/multisig",
    "/wallet/cold-storage",
    "/wallet/send",
    "/wallet/swaps"
  )

  foreach ($route in $routes) {
    try {
      Invoke-WebRequest -Uri ($baseUrl + $route) -UseBasicParsing -TimeoutSec 20 | Out-Null
    } catch {
      Write-Host ("WARN: wallet-web warm-up request failed for {0}: {1}" -f $route, $_.Exception.Message) -ForegroundColor Yellow
    }
  }
}

function Invoke-StepWithRetry([string]$name, [int]$MaxAttempts, [scriptblock]$step) {
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      $script:CurrentRetryAttempt = $attempt
      Invoke-Step $name $step
      return
    } catch {
      if ($attempt -ge $MaxAttempts) {
        throw
      }
      Write-Host ("WARN: {0} failed on attempt {1}/{2}; retrying once..." -f $name, $attempt, $MaxAttempts) -ForegroundColor Yellow
      Start-Sleep -Seconds 2
    }
  }
}

$workspaceRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$walletWebAttemptsParent = Join-Path $workspaceRoot "reports\wallet-web-e2e"
$walletWebRunId = "run-" + [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss-fff")
$walletWebAttemptsRoot = Join-Path $walletWebAttemptsParent $walletWebRunId
$env:KUBERCOIN_API_KEYS = $ApiKey
$env:KUBERCOIN_API_KEY = $ApiKey
$env:KUBERCOIN_TEST_MODE = "1"
$env:NEXT_TELEMETRY_DISABLED = "1"

New-Item -ItemType Directory -Path $walletWebAttemptsParent -Force | Out-Null
if (Test-Path $walletWebAttemptsRoot) {
  Remove-Item -LiteralPath $walletWebAttemptsRoot -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $walletWebAttemptsRoot -Force | Out-Null

$resolvedReportRoot = $null
$summaryPath = $null
if (-not [string]::IsNullOrWhiteSpace($ReportRoot)) {
  $resolvedReportRoot = $ReportRoot
  New-Item -ItemType Directory -Path $resolvedReportRoot -Force | Out-Null
  $summaryPath = Join-Path $resolvedReportRoot "e2e-full-summary.json"
}

function Write-RunSummary([bool]$Passed, [string]$FailureMessage = "") {
  if ($null -eq $summaryPath) {
    return
  }

  $runFinishedAt = Get-Date
  $attemptCount = @((Get-ChildItem -LiteralPath $walletWebAttemptsRoot -Directory -ErrorAction SilentlyContinue)).Count
  $summary = [pscustomobject]@{
    startedAt = $runStartedAt.ToString("o")
    finishedAt = $runFinishedAt.ToString("o")
    durationSec = [math]::Round(($runFinishedAt - $runStartedAt).TotalSeconds, 2)
    passed = $Passed
    failureMessage = $FailureMessage
    walletWebRunId = $walletWebRunId
    walletWebAttemptsRoot = $walletWebAttemptsRoot
    walletWebAttemptCount = $attemptCount
    stepResults = $stepResults
  }

  $summary | ConvertTo-Json -Depth 6 | Set-Content -Path $summaryPath -Encoding UTF8
}

try {
  Invoke-Step "Build node (release)" {
    powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\node_build_release.ps1" -StopRunningNode
  }

  Invoke-Step "E2E smoke" {
    powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\e2e_smoke.ps1" -ApiKey $ApiKey
  }

  Invoke-Step "E2E extended" {
    powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\e2e_extended.ps1" -ApiKey $ApiKey
  }

  Invoke-StepWithRetry "Wallet-web Playwright E2E" 2 {
    Initialize-WalletWebRoutes
    Invoke-WalletWebPlaywrightAttempt -Attempt $script:CurrentRetryAttempt
  }

  Write-RunSummary -Passed $true
  Write-Host "`nE2E full passed" -ForegroundColor Green
} catch {
  Write-RunSummary -Passed $false -FailureMessage $_.Exception.Message
  throw
}