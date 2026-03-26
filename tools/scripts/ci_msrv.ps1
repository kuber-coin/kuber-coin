param(
  [string]$Toolchain = '1.75',
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common_build.ps1"

$RepoRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$Cargo = Resolve-Cargo

function Ensure-Toolchain([string]$Name) {
  if ($SkipInstall) {
    return
  }

  $installed = rustup toolchain list | Out-String
  if ($installed -match [regex]::Escape($Name)) {
    return
  }

  rustup toolchain install $Name
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install Rust toolchain $Name"
  }
}

Ensure-Toolchain -Name $Toolchain

Push-Location $RepoRoot
try {
  & $Cargo "+$Toolchain" check --workspace
  if ($LASTEXITCODE -ne 0) {
    throw "MSRV check failed for toolchain $Toolchain"
  }
} finally {
  Pop-Location
}