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
    & $Cargo llvm-cov clean --workspace
    if ($LASTEXITCODE -ne 0) {
      throw 'cargo llvm-cov clean failed'
    }
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