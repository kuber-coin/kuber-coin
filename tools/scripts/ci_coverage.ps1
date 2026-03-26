param(
  [switch]$SkipInstall,
  [switch]$SummaryOnly,
  [switch]$HtmlOnly,
  [switch]$LcovOnly,
  [switch]$NoClean
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common_build.ps1"

$RepoRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$Cargo = Resolve-Cargo

if ([string]::IsNullOrWhiteSpace($env:CARGO_LLVM_COV_TARGET_DIR)) {
  $env:CARGO_LLVM_COV_TARGET_DIR = Join-Path $RepoRoot ("target\llvm-cov-" + [Guid]::NewGuid().ToString('N'))
}

$CoverageTargetDir = $env:CARGO_LLVM_COV_TARGET_DIR

function Invoke-CoverageClean {
  $attempts = 0
  while ($attempts -lt 3) {
    $attempts++

    Stop-KubercoinProcesses | Out-Null
    & $Cargo llvm-cov clean --workspace
    if ($LASTEXITCODE -eq 0) {
      return
    }

    Start-Sleep -Seconds $attempts
  }

  if (Test-Path $CoverageTargetDir) {
    Stop-KubercoinProcesses | Out-Null
    Start-Sleep -Seconds 2
    try {
      Remove-Item $CoverageTargetDir -Recurse -Force -ErrorAction Stop
      return
    } catch {
      throw "cargo llvm-cov clean failed and fallback removal of $CoverageTargetDir also failed: $($_.Exception.Message)"
    }
  }

  throw 'cargo llvm-cov clean failed'
}

function Ensure-Tooling {
  if ($SkipInstall) {
    return
  }

  $toolchains = rustup toolchain list | Out-String
  if ($toolchains -notmatch 'stable') {
    rustup toolchain install stable
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to install stable Rust toolchain'
    }
  }

  rustup component add llvm-tools-preview
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to install llvm-tools-preview'
  }

  $llvmCov = Get-Command cargo-llvm-cov -ErrorAction SilentlyContinue
  if (-not $llvmCov) {
    & $Cargo install cargo-llvm-cov
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to install cargo-llvm-cov'
    }
  }
}

Ensure-Tooling

Push-Location $RepoRoot
try {
  if (-not $NoClean) {
    Invoke-CoverageClean
  }

  if (-not $SummaryOnly -and -not $HtmlOnly) {
    & $Cargo llvm-cov --all-features --workspace --lcov --output-path lcov.info
    if ($LASTEXITCODE -ne 0) {
      throw 'LCOV coverage generation failed'
    }
  }

  if (-not $SummaryOnly -and -not $LcovOnly) {
    & $Cargo llvm-cov --all-features --workspace --html
    if ($LASTEXITCODE -ne 0) {
      throw 'HTML coverage generation failed'
    }
  }

  & $Cargo llvm-cov --all-features --workspace --summary-only
  if ($LASTEXITCODE -ne 0) {
    throw 'Coverage summary generation failed'
  }
} finally {
  Pop-Location
}