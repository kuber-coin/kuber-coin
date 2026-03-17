param(
  [int]$Iterations = 3,
  [string]$ApiKey = "public_test_key_not_a_secret"
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common_build.ps1"

function Write-Section([string]$text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

$workspaceRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$reportParent = Join-Path $workspaceRoot "reports\e2e-full-stress"
$sessionId = "session-" + [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss-fff")
$reportRoot = Join-Path $reportParent $sessionId
New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null

$summaryPath = Join-Path $reportRoot "summary.json"
$summaryMarkdownPath = Join-Path $reportRoot "summary.md"
$latestSummaryPath = Join-Path $reportParent "summary.json"
$latestSummaryMarkdownPath = Join-Path $reportParent "summary.md"
$latestSessionPath = Join-Path $reportParent "latest-session.txt"
Set-Content -Path $latestSessionPath -Value $reportRoot -Encoding UTF8

$results = @()
$sessionStartedAt = Get-Date

function Write-SessionSummaries() {
  $sessionFinishedAt = Get-Date
  $completedCount = $results.Count
  $allPassed = $completedCount -gt 0 -and ($results.Where({ -not $_.passed }).Count -eq 0)
  $totalDurationSec = [math]::Round((($results | Measure-Object -Property durationSec -Sum).Sum), 2)
  $averageDurationSec = if ($completedCount -gt 0) { [math]::Round((($results | Measure-Object -Property durationSec -Average).Average), 2) } else { 0 }
  $minDurationSec = if ($completedCount -gt 0) { [math]::Round((($results | Measure-Object -Property durationSec -Minimum).Minimum), 2) } else { 0 }
  $maxDurationSec = if ($completedCount -gt 0) { [math]::Round((($results | Measure-Object -Property durationSec -Maximum).Maximum), 2) } else { 0 }
  $retryRuns = @($results | Where-Object { $_.walletWebAttemptCount -gt 1 }).Count

  $jsonSummary = [pscustomobject]@{
    sessionId = Split-Path -Leaf $reportRoot
    reportRoot = $reportRoot
    startedAt = $sessionStartedAt.ToString("o")
    finishedAt = $sessionFinishedAt.ToString("o")
    iterationsRequested = $Iterations
    iterationsCompleted = $completedCount
    allPassed = $allPassed
    totalDurationSec = $totalDurationSec
    averageDurationSec = $averageDurationSec
    minDurationSec = $minDurationSec
    maxDurationSec = $maxDurationSec
    walletWebRetryRuns = $retryRuns
    results = $results
  }

  $markdownLines = @(
    "# Full E2E Stress Summary",
    "",
    "- Session: $(Split-Path -Leaf $reportRoot)",
    "- Started: $($sessionStartedAt.ToString('o'))",
    "- Finished: $($sessionFinishedAt.ToString('o'))",
    "- Iterations requested: $Iterations",
    "- Iterations completed: $completedCount",
    "- All passed: $allPassed",
    "- Total duration sec: $totalDurationSec",
    "- Average duration sec: $averageDurationSec",
    "- Min duration sec: $minDurationSec",
    "- Max duration sec: $maxDurationSec",
    "- Wallet-web retry runs: $retryRuns",
    "",
    "| Iteration | Passed | Exit Code | Duration Sec | Wallet-web Attempts | Log |",
    "| --- | --- | --- | --- | --- | --- |"
  )

  foreach ($result in $results) {
    $markdownLines += "| {0} | {1} | {2} | {3} | {4} | {5} |" -f $result.iteration, $result.passed, $result.exitCode, $result.durationSec, $result.walletWebAttemptCount, $result.logPath
  }

  $jsonSummary | ConvertTo-Json -Depth 8 | Set-Content -Path $summaryPath -Encoding UTF8
  $jsonSummary | ConvertTo-Json -Depth 8 | Set-Content -Path $latestSummaryPath -Encoding UTF8
  $markdownLines | Set-Content -Path $summaryMarkdownPath -Encoding UTF8
  $markdownLines | Set-Content -Path $latestSummaryMarkdownPath -Encoding UTF8
}

for ($iteration = 1; $iteration -le $Iterations; $iteration++) {
  Write-Section ("Full E2E stress run {0}/{1}" -f $iteration, $Iterations)

  $iterationRoot = Join-Path $reportRoot ("run-{0}" -f $iteration)
  if (Test-Path $iterationRoot) {
    Remove-Item -LiteralPath $iterationRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Path $iterationRoot -Force | Out-Null

  $runLog = Join-Path $iterationRoot "full-run.log"
  $runErrLog = Join-Path $iterationRoot "full-run.stderr.log"
  $metaPath = Join-Path $iterationRoot "result.json"
  $fullSummaryPath = Join-Path $iterationRoot "e2e-full-summary.json"
  $start = Get-Date
  $exitCode = 0

  try {
    $powershellPath = if ($IsWindows) { "powershell.exe" } else { "powershell" }
    $command = "$powershellPath -NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\e2e_full.ps1`" -ApiKey $ApiKey"
    "Command: $command" | Set-Content -Path $runLog -Encoding UTF8
    if (Test-Path $runErrLog) {
      Remove-Item -LiteralPath $runErrLog -Force -ErrorAction SilentlyContinue
    }

    $process = Start-Process -FilePath $powershellPath `
      -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$PSScriptRoot\e2e_full.ps1", "-ApiKey", $ApiKey, "-ReportRoot", $iterationRoot `
      -WorkingDirectory $workspaceRoot `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $runLog `
      -RedirectStandardError $runErrLog
    $exitCode = $process.ExitCode

    if (Test-Path $runLog) {
      Get-Content -LiteralPath $runLog | Out-Host
    }
    if (Test-Path $runErrLog) {
      $stderrLines = Get-Content -LiteralPath $runErrLog
      if ($stderrLines.Count -gt 0) {
        $stderrLines | Out-Host
      }
    }
  } catch {
    $errorText = $_ | Out-String
    try {
      Add-Content -Path $runErrLog -Value $errorText -Encoding UTF8
    } catch {
      # Ignore secondary logging failures so the iteration can still be recorded.
    }
    $errorText | Out-Host
    $exitCode = if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { $LASTEXITCODE } else { 1 }
  }

  $durationSec = [math]::Round(((Get-Date) - $start).TotalSeconds, 2)
  $attemptCount = 0
  $walletWebRunId = $null
  $walletWebAttemptsRoot = $null
  if (Test-Path $fullSummaryPath) {
    $fullSummary = Get-Content -LiteralPath $fullSummaryPath -Raw | ConvertFrom-Json
    $attemptCount = [int]$fullSummary.walletWebAttemptCount
    $walletWebRunId = $fullSummary.walletWebRunId
    $walletWebAttemptsRoot = $fullSummary.walletWebAttemptsRoot
    if (-not [string]::IsNullOrWhiteSpace($walletWebAttemptsRoot) -and (Test-Path $walletWebAttemptsRoot)) {
      Copy-Item -LiteralPath $walletWebAttemptsRoot -Destination (Join-Path $iterationRoot "wallet-web-e2e") -Recurse -Force
    }
  }

  $results += [pscustomobject]@{
    iteration = $iteration
    exitCode = $exitCode
    passed = ($exitCode -eq 0)
    durationSec = $durationSec
    walletWebAttemptCount = $attemptCount
    walletWebRunId = $walletWebRunId
    logPath = $runLog
  }

  $results[-1] | ConvertTo-Json -Depth 4 | Set-Content -Path $metaPath -Encoding UTF8
  Write-SessionSummaries

  if ($exitCode -ne 0) {
    Write-Host ("Run {0} failed; stopping stress loop." -f $iteration) -ForegroundColor Yellow
    break
  }
}

Write-Section "Stress summary"
$results | Format-Table -AutoSize | Out-Host
Write-Host ("Summary written to {0}" -f $summaryPath) -ForegroundColor Green

if ($results.Where({ -not $_.passed }).Count -gt 0) {
  exit 1
}
