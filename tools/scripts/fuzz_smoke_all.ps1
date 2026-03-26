[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseApprovedVerbs', '', Justification='Internal script helper naming')]
param(
  [string[]]$Targets = @(
    'fuzz_psbt',
    'fuzz_block',
    'fuzz_script',
    'fuzz_difficulty',
    'fuzz_address',
    'fuzz_p2p_message',
    'fuzz_transaction',
    'fuzz_psbt_deserialize',
    'fuzz_bech32m',
    'fuzz_utxo_decompress',
    'fuzz_descriptor',
    'fuzz_rpc_json',
    'fuzz_hd_wallet',
    'fuzz_stratum'
  ),
  [int]$Runs = 1,
  [int]$MaxTotalTime = 0,
  [string]$Sanitizer = '',
  [switch]$SkipToolInstall,
  [switch]$ForceWindowsFuzz
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common_build.ps1"

$RepoRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$FuzzDir = Join-Path $RepoRoot 'core\tests\fuzz'
$Cargo = Resolve-Cargo

function Write-Section([string]$Title) {
  Write-Host "`n=== $Title ===" -ForegroundColor Cyan
}

function Resolve-DefaultSanitizer {
  if (-not [string]::IsNullOrWhiteSpace($Sanitizer)) {
    return $Sanitizer
  }

  if ($IsWindows -or $env:OS -eq 'Windows_NT') {
    return 'none'
  }

  return 'address'
}

function Test-CargoFuzzInstalled {
  try {
    & $Cargo fuzz --version *> $null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

function Test-NightlyInstalled {
  try {
    $toolchains = rustup toolchain list | Out-String
    return ($toolchains -match 'nightly')
  } catch {
    return $false
  }
}

function Invoke-CompileOnlyValidation {
  Write-Section 'Windows fallback'
  Write-Host 'Local libFuzzer execution is not supported on this Windows MSVC toolchain in the current repo setup.' -ForegroundColor Yellow
  Write-Host 'Running compile-only validation instead. Use Linux, WSL, or CI for real fuzz execution.' -ForegroundColor Yellow

  & $Cargo check --manifest-path (Join-Path $FuzzDir 'Cargo.toml') --bins
  if ($LASTEXITCODE -ne 0) {
    throw 'Compile-only fuzz validation failed'
  }

  Write-Host "`nCOMPILE-ONLY FUZZ VALIDATION PASSED" -ForegroundColor Green
}

function Ensure-Tooling {
  if ($SkipToolInstall) {
    return
  }

  if (-not (Test-CargoFuzzInstalled)) {
    Write-Section 'Install cargo-fuzz'
    & $Cargo install cargo-fuzz --locked
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to install cargo-fuzz'
    }
  }

  if (-not (Test-NightlyInstalled)) {
    Write-Section 'Install nightly toolchain'
    rustup toolchain install nightly
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to install nightly toolchain'
    }
  }
}

function Invoke-FuzzTarget([string]$TargetName, [string]$TargetSanitizer) {
  $corpusDir = Join-Path $FuzzDir (Join-Path 'corpus' $TargetName)
  if (-not (Test-Path $corpusDir)) {
    New-Item -ItemType Directory -Path $corpusDir -Force | Out-Null
  }

  $args = @(
    '+nightly',
    'fuzz',
    'run',
    '--fuzz-dir', $FuzzDir,
    '--sanitizer', $TargetSanitizer,
    $TargetName,
    $corpusDir,
    '--'
  )

  if ($Runs -gt 0) {
    $args += "-runs=$Runs"
  }
  if ($MaxTotalTime -gt 0) {
    $args += "-max_total_time=$MaxTotalTime"
  }

  & $Cargo @args
  return $LASTEXITCODE
}

Ensure-Tooling

$selectedSanitizer = Resolve-DefaultSanitizer

if (($IsWindows -or $env:OS -eq 'Windows_NT') -and -not $ForceWindowsFuzz) {
  Invoke-CompileOnlyValidation
  return
}

Write-Section 'Fuzz smoke sweep'
Write-Host "Fuzz dir: $FuzzDir"
Write-Host "Sanitizer: $selectedSanitizer"
Write-Host "Runs per target: $Runs"
if ($MaxTotalTime -gt 0) {
  Write-Host "Max total time per target: $MaxTotalTime s"
}

$failures = @()
foreach ($target in $Targets) {
  Write-Section $target
  $exitCode = Invoke-FuzzTarget -TargetName $target -TargetSanitizer $selectedSanitizer
  if ($exitCode -ne 0) {
    $failures += [pscustomobject]@{ Target = $target; ExitCode = $exitCode }
    Write-Host ("FAIL: {0} (exit {1})" -f $target, $exitCode) -ForegroundColor Red
    continue
  }

  Write-Host ("OK: {0}" -f $target) -ForegroundColor Green
}

if ($failures.Count -gt 0) {
  Write-Section 'Failures'
  foreach ($failure in $failures) {
    Write-Host ("{0}: exit {1}" -f $failure.Target, $failure.ExitCode) -ForegroundColor Red
  }
  throw ("Fuzz smoke sweep failed for {0} target(s)" -f $failures.Count)
}

Write-Host "`nALL FUZZ SMOKE TARGETS PASSED" -ForegroundColor Green