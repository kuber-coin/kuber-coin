[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseApprovedVerbs', '', Justification='Internal script helper naming')]
param(
  [switch]$Fast,
  [switch]$SkipE2E,
  [switch]$SkipSecurity,
  [switch]$SkipMsrv,
  [switch]$SkipDocs,
  [switch]$SkipSdkJs,
  [switch]$SkipConvergence,
  [switch]$IncludeCoverage,
  [switch]$IncludeWslFuzz
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common_build.ps1"

$RepoRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$Cargo = Resolve-Cargo

function Write-Section([string]$Title) {
  Write-Host "`n=== $Title ===" -ForegroundColor Cyan
}

function Invoke-Step([string]$Name, [scriptblock]$Step) {
  Write-Section $Name
  & $Step
  if (-not $?) {
    throw "Step failed: $Name"
  }
  if ($global:LASTEXITCODE -ne 0) {
    throw ("Step failed: {0} (exit {1})" -f $Name, $global:LASTEXITCODE)
  }
  Write-Host "OK: $Name" -ForegroundColor Green
}

Push-Location $RepoRoot
try {
  Invoke-Step 'Formatting' {
    & $Cargo fmt --all -- --check
  }

  Invoke-Step 'Clippy' {
    & $Cargo clippy --workspace --all-targets -- -D warnings
  }

  Invoke-Step 'Workspace tests' {
    & $Cargo test --workspace
  }

  Invoke-Step 'Release build' {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'node_build_release.ps1') -StopRunningNode
  }

  if (-not $Fast -and -not $SkipSdkJs) {
    Invoke-Step 'JS SDK' {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ci_sdk_js.ps1')
    }
  }

  if (-not $Fast -and -not $SkipConvergence) {
    Invoke-Step 'Convergence' {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ci_convergence.ps1')
    }
  }

  if (-not $Fast -and -not $SkipSecurity) {
    Invoke-Step 'Security checks' {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ci_security.ps1')
    }
  }

  if (-not $Fast -and -not $SkipDocs) {
    Invoke-Step 'Rustdoc' {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ci_doc.ps1')
    }
  }

  if (-not $Fast -and -not $SkipMsrv) {
    Invoke-Step 'MSRV' {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ci_msrv.ps1')
    }
  }

  if (-not $Fast -and $IncludeCoverage) {
    Invoke-Step 'Coverage' {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ci_coverage.ps1')
    }
  }

  if (-not $Fast -and -not $SkipE2E) {
    Invoke-Step 'Extended E2E' {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'e2e_extended.ps1')
    }
  }

  if (-not $Fast -and $IncludeWslFuzz) {
    Invoke-Step 'WSL fuzz sweep' {
      wsl.exe bash -lc "cd /mnt/c/kubercoin-export && bash tools/scripts/fuzz_smoke_all.sh"
    }
  }

  Write-Host "`nLOCAL GITHUB ACTIONS MIRROR PASSED" -ForegroundColor Green
} finally {
  Pop-Location
}