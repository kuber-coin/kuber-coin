param(
  [switch]$SkipInstall,
  [switch]$AuditOnly,
  [switch]$DenyOnly
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common_build.ps1"

$RepoRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$Cargo = Resolve-Cargo

function Ensure-CargoTool([string]$CommandName, [string[]]$InstallArgs) {
  if ($SkipInstall) {
    return
  }

  $tool = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($tool) {
    return
  }

  & $Cargo install @InstallArgs
  if ($LASTEXITCODE -ne 0) {
    throw ("Failed to install {0}" -f ($InstallArgs -join ' '))
  }
}

Push-Location $RepoRoot
try {
  if (-not $DenyOnly) {
    Ensure-CargoTool -CommandName 'cargo-audit' -InstallArgs @('cargo-audit')
    & $Cargo audit --deny warnings
    if ($LASTEXITCODE -ne 0) {
      throw 'cargo audit failed'
    }
  }

  if (-not $AuditOnly) {
    Ensure-CargoTool -CommandName 'cargo-deny' -InstallArgs @('cargo-deny', '--locked')
    & $Cargo deny check
    if ($LASTEXITCODE -ne 0) {
      throw 'cargo deny check failed'
    }
  }
} finally {
  Pop-Location
}